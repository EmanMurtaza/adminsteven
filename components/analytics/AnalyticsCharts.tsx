"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { Listing } from "@/lib/types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import type { PipelineAnalytics, InquiryAnalytics } from "@/lib/analytics";
import type { ListingAnalytics } from "@/lib/listings";

interface Props {
  pipeline: PipelineAnalytics;
  inquiries: InquiryAnalytics;
  listings: ListingAnalytics;
  recentListings: Listing[];
}

// Keyed off the site's own palette (app/globals.css) so the charts read as
// part of the admin panel rather than a bolted-on widget.
const NAVY = "#16243f";
const GOLD = "#d4a84b";
const GOLD_LIGHT = "#e8c879";
const GOLD_DARK = "#a07830";
const BURGUNDY = "#6b1f2e";
const INK_MUTE = "#7f8898";
const TRACK = "#f0ddb0";

const STAGE_COLORS = [GOLD, NAVY, "#3a4d70", GOLD_DARK, INK_MUTE, BURGUNDY];
const PIE_COLORS = [GOLD, NAVY, GOLD_DARK, BURGUNDY, INK_MUTE];

// Dense, BI-tool-style panels: small header label, tight padding, short chart
// bodies. A dashboard reads as "modern" by fitting many panels on one screen,
// not by giving each one more room.
const cardClass =
  "bg-white border border-gold/25 rounded-xl p-3.5 shadow-[0_2px_16px_-10px_rgba(14,27,48,0.12)] h-full flex flex-col";
const tickStyle = { fontSize: 10, fill: "#7f8898" };
const tooltipStyle = {
  fontSize: 11,
  borderRadius: 6,
  border: "1px solid rgba(212,168,75,0.35)",
  boxShadow: "0 8px 24px -8px rgba(14,27,48,0.2)",
};

function PanelTitle({ children, meta }: { children: React.ReactNode; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-2.5 gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-navy">
        {children}
      </h2>
      {meta && <span className="text-[10px] text-ink-mute shrink-0">{meta}</span>}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-ink-mute text-center py-8 m-auto">{children}</p>;
}

// A labeled horizontal progress bar — used for the pipeline funnel and lead
// sources, since it's denser and easier to scan at this size than a bar chart.
function ProgressRows({
  rows,
  total,
}: {
  rows: { label: string; count: number; fill: string }[];
  total?: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-2 flex-1 flex flex-col justify-center">
      {rows.map((r) => {
        const pct = total ? Math.round((r.count / total) * 100) : null;
        return (
          <div key={r.label}>
            <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
              <span className="text-navy font-medium truncate" title={r.label}>
                {r.label}
              </span>
              <span className="text-ink-mute shrink-0 tabular-nums">
                {r.count}
                {pct !== null && <span className="text-ink-mute/70"> · {pct}%</span>}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-cream-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${(r.count / max) * 100}%`, backgroundColor: r.fill }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WinRateGauge({ rate }: { rate: number | null }) {
  const pct = rate === null ? 0 : Math.round(rate * 100);
  const data = [{ name: "rate", value: pct }];
  return (
    <div className="relative flex-1 min-h-[120px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          data={data}
          startAngle={90}
          endAngle={-270}
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar background={{ fill: TRACK }} dataKey="value" cornerRadius={8} fill={GOLD_DARK} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-serif text-2xl text-navy font-semibold leading-none">
          {rate === null ? "—" : `${pct}%`}
        </span>
        <span className="text-[9px] uppercase tracking-[0.12em] text-ink-mute mt-1">
          {rate === null ? "no decisions" : "decided leads"}
        </span>
      </div>
    </div>
  );
}

// GitHub-style activity grid — a different visual language from the bars and
// lines elsewhere on the page, so the panel row doesn't read as one chart
// repeated six times.
function ActivityHeatmap({ trend }: { trend: { date: string; count: number }[] }) {
  const max = Math.max(1, ...trend.map((t) => t.count));
  return (
    <div className="flex-1 flex flex-col justify-center">
      <div className="grid grid-cols-10 gap-[3px]">
        {trend.map((t) => {
          const intensity = t.count / max;
          return (
            <div
              key={t.date}
              title={`${t.date}: ${t.count} enquir${t.count === 1 ? "y" : "ies"}`}
              className="aspect-square rounded-[2px]"
              style={{
                backgroundColor: GOLD_DARK,
                opacity: t.count === 0 ? 0.08 : 0.3 + intensity * 0.7,
              }}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-ink-mute mt-2.5">Last 30 days, daily</p>
    </div>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AnalyticsCharts({ pipeline, inquiries, listings, recentListings }: Props) {
  const stageRows = pipeline.byStage.map((s, i) => ({
    label: s.label,
    count: s.count,
    fill: STAGE_COLORS[i % STAGE_COLORS.length],
  }));

  const sourceRows = pipeline.bySource.slice(0, 5).map((s) => ({
    label: s.source,
    count: s.count,
    fill: GOLD_DARK,
  }));

  const leadTypeData = pipeline.byLeadType
    .filter((t) => t.count > 0)
    .map((t) => ({ name: t.label, value: t.count }));

  const trendData = inquiries.trend.map((p) => ({ ...p, label: formatShortDate(p.date) }));

  const statusData = listings.byStatus.map((s) => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    count: s.count,
  }));

  const propertyTypeData = listings.byPropertyType.map((p) => ({
    name: p.propertyType
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    count: p.count,
  }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {/* Enquiries trend */}
      <div className={cardClass}>
        <PanelTitle meta="30d">Enquiries</PanelTitle>
        {inquiries.totalLast30Days === 0 ? (
          <EmptyNote>No enquiries in the last 30 days.</EmptyNote>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={trendData} margin={{ left: -20, right: 5, top: 5 }}>
              <defs>
                <linearGradient id="enquiryFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ddb0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={tickStyle}
                interval={Math.max(0, Math.floor(trendData.length / 4) - 1)}
              />
              <YAxis allowDecimals={false} tick={tickStyle} width={22} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="count"
                stroke={GOLD_DARK}
                strokeWidth={2}
                fill="url(#enquiryFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Activity heatmap */}
      <div className={cardClass}>
        <PanelTitle>Enquiry activity</PanelTitle>
        <ActivityHeatmap trend={inquiries.trend} />
      </div>

      {/* Win rate gauge */}
      <div className={cardClass}>
        <PanelTitle>Win rate</PanelTitle>
        <WinRateGauge rate={pipeline.conversionRate} />
      </div>

      {/* Pipeline funnel */}
      <div className={cardClass}>
        <PanelTitle meta={`${pipeline.totalContacts} total`}>Pipeline</PanelTitle>
        {pipeline.totalContacts === 0 ? (
          <EmptyNote>No contacts yet.</EmptyNote>
        ) : (
          <ProgressRows rows={stageRows} total={pipeline.totalContacts} />
        )}
      </div>

      {/* Lead type split */}
      <div className={cardClass}>
        <PanelTitle>Lead type</PanelTitle>
        {leadTypeData.length === 0 ? (
          <EmptyNote>Nothing to break down yet.</EmptyNote>
        ) : (
          <div className="flex-1 flex items-center gap-3">
            <ResponsiveContainer width="55%" height={120}>
              <PieChart>
                <Pie
                  data={leadTypeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={32}
                  outerRadius={54}
                  paddingAngle={2}
                >
                  {leadTypeData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 text-[11px] flex-1 min-w-0">
              {leadTypeData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="text-ink-soft truncate">{d.name}</span>
                  <span className="text-navy font-medium ml-auto">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lead sources */}
      <div className={cardClass}>
        <PanelTitle>Top sources</PanelTitle>
        {sourceRows.length === 0 ? (
          <EmptyNote>No sources recorded yet.</EmptyNote>
        ) : (
          <ProgressRows rows={sourceRows} />
        )}
      </div>

      {/* Listings by status */}
      <div className={cardClass}>
        <PanelTitle meta={`${listings.totalCount} total`}>Listings by status</PanelTitle>
        {listings.totalCount === 0 ? (
          <EmptyNote>No listings yet.</EmptyNote>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={statusData} margin={{ left: -20, right: 5, top: 5 }}>
              <defs>
                <linearGradient id="statusFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD_LIGHT} />
                  <stop offset="100%" stopColor={GOLD_DARK} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ddb0" vertical={false} />
              <XAxis dataKey="name" tick={tickStyle} />
              <YAxis allowDecimals={false} tick={tickStyle} width={22} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(212,168,75,0.08)" }} />
              <Bar dataKey="count" fill="url(#statusFill)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Listings by property type */}
      <div className={cardClass}>
        <PanelTitle>By property type</PanelTitle>
        {listings.totalCount === 0 ? (
          <EmptyNote>No listings yet.</EmptyNote>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={propertyTypeData} margin={{ left: -20, right: 5, top: 5 }}>
              <defs>
                <linearGradient id="typeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3a4d70" />
                  <stop offset="100%" stopColor={NAVY} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ddb0" vertical={false} />
              <XAxis dataKey="name" tick={tickStyle} />
              <YAxis allowDecimals={false} tick={tickStyle} width={22} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(212,168,75,0.08)" }} />
              <Bar dataKey="count" fill="url(#typeFill)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent listings */}
      <div className={cardClass}>
        <PanelTitle>
          <Link href="/listings" className="hover:text-gold-dark transition-colors">
            Recent listings →
          </Link>
        </PanelTitle>
        {recentListings.length === 0 ? (
          <EmptyNote>No listings yet.</EmptyNote>
        ) : (
          <div className="divide-y divide-gold/10 flex-1">
            {recentListings.slice(0, 6).map((l) => (
              <Link
                key={l.id}
                href={`/listings/${l.id}`}
                className="flex items-center justify-between gap-2 py-1.5 text-[11px] hover:bg-cream-100/60 -mx-1 px-1 rounded transition-colors"
              >
                <span className="truncate text-navy font-medium">{l.title}</span>
                <span className="shrink-0 text-ink-mute tabular-nums">{formatPrice(l.price)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
