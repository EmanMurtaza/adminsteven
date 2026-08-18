// Aggregates behind the BI dashboard.
//
// The CRM tables are small (a personal book of business, not a call center),
// so most of this reads a bounded slice of rows and reduces in JS rather than
// standing up Postgres RPCs. `stage` and `lead_type` are fixed small enum
// sets, so those go through cheap `count: exact, head: true` queries per
// value — accurate no matter how large `contacts` grows. Free-text fields
// (`source`) can't be bucketed that way, so they read a capped slice instead.

import type { SupabaseClient } from "@supabase/supabase-js";
import { STAGES, LEAD_TYPES, type Stage, type LeadType } from "./contacts";

const SOURCE_SAMPLE_CAP = 4999; // rows read for free-text groupings, 0-indexed range
const TREND_DAYS = 30;
const SPARK_DAYS = 14; // shorter window for the little in-card trend lines

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** One point per day for the last `days` days (oldest first), from a list of ISO timestamps. */
function dailyTrend(timestamps: (string | null)[], days: number): { date: string; count: number }[] {
  const byDay = new Map<string, number>();
  for (const ts of timestamps) {
    const day = ts?.slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const trend: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trend.push({ date: key, count: byDay.get(key) ?? 0 });
  }
  return trend;
}

export interface PipelineAnalytics {
  totalContacts: number;
  byStage: { stage: Stage; label: string; count: number }[];
  /**
   * How many contacts hold each role IN ANY CAPACITY, so the buckets overlap and
   * deliberately sum to more than `totalContacts`.
   *
   * Counting `lead_type` instead would report 8 sellers in an account with 658
   * of them — a contact who is buying and selling has one primary role and is
   * still a seller. It would also disagree with the contacts list, whose Type
   * filter has always matched on `deal_types`.
   */
  byLeadType: { type: LeadType; label: string; count: number }[];
  bySource: { source: string; count: number }[];
  newLast7Days: number;
  newPrevWeek: number;
  newLast30Days: number;
  /** One point per day for the last 14 days — feeds the "Total Leads" sparkline. */
  leadsTrend: { date: string; count: number }[];
  /** closed / (closed + lost) among contacts that have reached a decision. Null if none have. */
  conversionRate: number | null;
}

export async function getPipelineAnalytics(
  supabase: SupabaseClient
): Promise<PipelineAnalytics> {
  const [
    { count: totalContacts },
    byStage,
    byLeadType,
    { count: newLast7Days },
    { count: newPrevWeek },
    { count: newLast30Days },
    { data: sourceRows },
    { data: sparkRows },
  ] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    Promise.all(
      STAGES.map(async (s) => {
        const { count } = await supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("stage", s.value);
        return { stage: s.value, label: s.label, count: count ?? 0 };
      })
    ),
    Promise.all(
      LEAD_TYPES.map(async (t) => {
        // `contains`, not `eq` on lead_type — the same predicate the contacts
        // list uses, so the chart and the filter cannot disagree. 'unknown' is
        // never written into deal_types (an empty array is), so it is counted
        // as the absence of any role rather than as a role.
        const query = supabase.from("contacts").select("*", { count: "exact", head: true });
        const { count } =
          t.value === "unknown"
            ? await query.eq("deal_types", "{}")
            : await query.contains("deal_types", [t.value]);
        return { type: t.value, label: t.label, count: count ?? 0 };
      })
    ),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", daysAgoISO(7)),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", daysAgoISO(14))
      .lt("created_at", daysAgoISO(7)),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", daysAgoISO(30)),
    supabase.from("contacts").select("source").range(0, SOURCE_SAMPLE_CAP),
    supabase
      .from("contacts")
      .select("created_at")
      .gte("created_at", daysAgoISO(SPARK_DAYS))
      .range(0, SOURCE_SAMPLE_CAP),
  ]);

  // "Decided" is every lead no longer being worked, whichever way it went.
  const closed = byStage.find((s) => s.stage === "closed")?.count ?? 0;
  const archived = byStage.find((s) => s.stage === "archived")?.count ?? 0;
  const decided = closed + archived;

  const sourceCounts = new Map<string, number>();
  for (const row of sourceRows ?? []) {
    const key = (row.source ?? "").trim() || "Unknown";
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const bySource = [...sourceCounts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalContacts: totalContacts ?? 0,
    byStage,
    byLeadType,
    bySource,
    newLast7Days: newLast7Days ?? 0,
    newPrevWeek: newPrevWeek ?? 0,
    newLast30Days: newLast30Days ?? 0,
    leadsTrend: dailyTrend((sparkRows ?? []).map((r) => r.created_at), SPARK_DAYS),
    conversionRate: decided > 0 ? closed / decided : null,
  };
}

export interface InquiryAnalytics {
  totalLast30Days: number;
  unread: number;
  last7Days: number;
  prevWeek: number;
  byType: { source: string; label: string; count: number }[];
  /** One point per day for the last 30 days, oldest first. */
  trend: { date: string; count: number }[];
}

export async function getInquiryAnalytics(
  supabase: SupabaseClient
): Promise<InquiryAnalytics> {
  const since = daysAgoISO(TREND_DAYS);

  const [{ count: unread }, { data: rows }] = await Promise.all([
    supabase
      .from("contact_submissions")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false),
    supabase
      .from("contact_submissions")
      .select("created_at, source")
      .gte("created_at", since)
      .range(0, SOURCE_SAMPLE_CAP),
  ]);

  const byType = new Map<string, number>();
  for (const row of rows ?? []) {
    const type = row.source || "unknown";
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }

  const trend = dailyTrend((rows ?? []).map((r) => r.created_at), TREND_DAYS);
  const last7Days = trend.slice(-7).reduce((sum, p) => sum + p.count, 0);
  const prevWeek = trend.slice(-14, -7).reduce((sum, p) => sum + p.count, 0);

  const typeLabels: Record<string, string> = { buyer: "Buyer", seller: "Seller" };

  return {
    totalLast30Days: rows?.length ?? 0,
    unread: unread ?? 0,
    last7Days,
    prevWeek,
    byType: [...byType.entries()]
      .map(([source, count]) => ({ source, label: typeLabels[source] ?? "Other", count }))
      .sort((a, b) => b.count - a.count),
    trend,
  };
}
