import Header from "@/components/layout/Header";
import SyncFieldLegend from "@/components/sync/SyncFieldLegend";
import SyncNowButton from "@/components/sync/SyncNowButton";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { pullContacts, MANUAL_MIN_INTERVAL_MS, type SyncResult } from "@/lib/boldtrail/sync";
import { getLastPullAt, getLockedUntil, getTokenFingerprint } from "@/lib/boldtrail/state";
import { formatDateTime } from "@/lib/format";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/** Module scope: reading the clock during render is impure. */
function millisSince(when: Date | null): number {
  return when ? Date.now() - when.getTime() : Number.POSITIVE_INFINITY;
}

export default async function SyncPage() {
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const configured = Boolean(process.env.BOLDTRAIL_API_TOKEN);
  const enabled = process.env.BOLDTRAIL_SYNC_ENABLED !== "false";

  // These three reads are what a run does before deciding whether to touch the
  // network at all — showing them means the page explains its own behaviour
  // instead of the button just doing nothing.
  const [lastPullAt, lockedUntil, fingerprint] = await Promise.all([
    getLastPullAt(supabase),
    getLockedUntil(supabase),
    getTokenFingerprint(supabase),
  ]);

  const [{ data: runData }, { count: linkedCount }, { count: enrichedCount }, { count: conflictCount }] =
    await Promise.all([
      supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("contacts").select("*", { count: "exact", head: true }).not("external_id", "is", null),
      supabase.from("contacts").select("*", { count: "exact", head: true }).not("external_detail_at", "is", null),
      supabase.from("contacts").select("*", { count: "exact", head: true }).eq("sync_status", "conflict"),
    ]);

  const runs = (runData ?? []) as Record<string, unknown>[];

  const waitMs = Math.max(0, MANUAL_MIN_INTERVAL_MS - millisSince(lastPullAt));

  let disabledReason: string | undefined;
  if (!configured) disabledReason = "No BoldTrail API token is set. Add BOLDTRAIL_API_TOKEN to .env.local.";
  else if (!enabled) disabledReason = "Sync is switched off (BOLDTRAIL_SYNC_ENABLED=false).";
  else if (lockedUntil)
    disabledReason = `BoldTrail locked us out. Standing down until ${formatDateTime(lockedUntil.toISOString())} — asking again sooner tends to extend it.`;
  else if (waitMs > 0)
    disabledReason = `Synced in the last few minutes. You can run it again in ${Math.ceil(waitMs / 60000)} minute(s).`;

  async function syncNow(input: { dryRun: boolean }): Promise<SyncResult> {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) {
      return {
        status: "failed", reason: "Not signed in — please log in again.",
        listed: 0, created: 0, adopted: 0, updated: 0, unchanged: 0,
        conflicts: 0, skipped: 0, detailFetched: 0, remoteDeleted: 0, requests: 0,
      };
    }
    // Same function the cron calls, so a manual run can never behave
    // differently from a scheduled one.
    const result = await pullContacts(supabase, { mode: "manual", dryRun: input.dryRun });
    if (!input.dryRun) {
      revalidatePath("/sync");
      revalidatePath("/contacts");
      revalidatePath("/dashboard");
    }
    return result;
  }

  return (
    <>
      <Header title="BoldTrail sync" />
      <main className="p-4 sm:p-8 space-y-5 max-w-4xl">
        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 space-y-5">
          <div className="grid sm:grid-cols-3 gap-4">
            <Stat
              label="Connection"
              value={!configured ? "Not set up" : !enabled ? "Switched off" : lockedUntil ? "Backing off" : "Ready"}
            />
            <Stat label="Contacts linked" value={String(linkedCount ?? 0)} />
            <Stat
              label="Full records"
              value={`${enrichedCount ?? 0} of ${linkedCount ?? 0}`}
              hint="The detailed record costs one request per contact, so these fill in gradually."
            />
          </div>

          <div className="text-xs text-ink-mute space-y-1 border-t border-gold/15 pt-4">
            <p>Token: {fingerprint ?? "not seen yet"} · runs automatically once a day</p>
            <p>Last run: {lastPullAt ? formatDateTime(lastPullAt.toISOString()) : "never"}</p>
          </div>

          <SyncNowButton
            onSync={syncNow}
            disabled={!configured || !enabled || Boolean(lockedUntil)}
            disabledReason={disabledReason}
          />
        </div>

        {(conflictCount ?? 0) > 0 && (
          <div className="bg-white border border-burgundy/30 rounded-xl p-5">
            <p className="text-sm text-navy">
              <strong>{conflictCount}</strong> contact{conflictCount === 1 ? " was" : "s were"} changed
              in both places since the last sync. Your version was kept in every case —
              BoldTrail&rsquo;s is stored alongside it rather than applied.
            </p>
          </div>
        )}

        <SyncFieldLegend />

        <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7">
          <h2 className="font-serif text-lg text-navy mb-1">Recent runs</h2>
          <p className="text-sm text-ink-mute mb-4">
            Watch the requests column. A run that changed nothing should cost about
            two — if it ever costs hundreds, something is re-fetching what it already has.
          </p>
          {runs.length === 0 ? (
            <p className="text-sm text-ink-mute">Nothing has run yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-ink-mute border-b border-gold/20">
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">How</th>
                    <th className="py-2 pr-4 font-medium">Result</th>
                    <th className="py-2 pr-4 font-medium text-right">New</th>
                    <th className="py-2 pr-4 font-medium text-right">Updated</th>
                    <th className="py-2 pr-4 font-medium text-right">Unchanged</th>
                    <th className="py-2 font-medium text-right">Requests</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gold/10">
                  {runs.map((run) => (
                    <tr key={String(run.id)}>
                      <td className="py-2.5 pr-4 text-ink-mute text-xs whitespace-nowrap">
                        {formatDateTime(String(run.started_at))}
                      </td>
                      <td className="py-2.5 pr-4 text-ink-soft text-xs">{String(run.mode)}</td>
                      <td className="py-2.5 pr-4 text-navy">{String(run.status)}</td>
                      <td className="py-2.5 pr-4 text-right text-navy">{String(run.created_count)}</td>
                      <td className="py-2.5 pr-4 text-right text-ink-soft">{String(run.updated_count)}</td>
                      <td className="py-2.5 pr-4 text-right text-ink-mute">{String(run.unchanged_count)}</td>
                      <td className="py-2.5 text-right text-ink-soft">{String(run.requests_made)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gold/25 bg-cream-100 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-mute">{label}</p>
      <p className="font-serif text-xl text-navy mt-1">{value}</p>
      {hint && <p className="text-[11px] text-ink-mute mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}
