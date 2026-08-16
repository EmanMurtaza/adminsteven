"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { SyncResult } from "@/lib/boldtrail/sync";

interface Props {
  disabled?: boolean;
  disabledReason?: string;
  onSync: (input: { dryRun: boolean }) => Promise<SyncResult>;
}

export default function SyncNowButton({ disabled, disabledReason, onSync }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"dry" | "real" | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [wasDryRun, setWasDryRun] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "real");
    setResult(null);
    const outcome = await onSync({ dryRun });
    setBusy(null);
    setResult(outcome);
    setWasDryRun(dryRun);
    if (!dryRun) router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Dry run first, and listed first, because it is the one that cannot
            do any harm — on an API this touchy that deserves to be the
            default reach. */}
        <button
          onClick={() => run(true)}
          disabled={busy !== null || disabled}
          className="border border-navy/30 text-navy hover:bg-navy hover:text-cream disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          {busy === "dry" ? "Checking…" : "Preview changes"}
        </button>
        <button
          onClick={() => run(false)}
          disabled={busy !== null || disabled}
          className="bg-navy hover:bg-navy-500 text-cream disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
        >
          <RefreshCw size={14} className={busy === "real" ? "animate-spin" : ""} />
          {busy === "real" ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {disabled && disabledReason && (
        <p className="text-xs text-ink-mute">{disabledReason}</p>
      )}

      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            result.status === "failed"
              ? "bg-burgundy/10 border-burgundy/30 text-burgundy"
              : result.status === "skipped"
                ? "bg-cream-200 border-ink-mute/25 text-ink-soft"
                : "bg-gold/10 border-gold/30 text-navy"
          }`}
        >
          {result.status === "skipped" ? (
            <p>{result.reason}</p>
          ) : result.status === "failed" ? (
            <>
              <p className="font-medium mb-1">Sync failed — nothing was changed.</p>
              <p className="text-xs">{result.reason ?? result.error}</p>
            </>
          ) : (
            <>
              <p className="font-medium mb-1">
                {wasDryRun ? "Preview — nothing was saved" : "Sync finished"}
                {result.status === "partial" && " (partial — will continue next run)"}
              </p>
              <p className="text-xs leading-relaxed">
                {result.listed} contact{result.listed === 1 ? "" : "s"} seen in BoldTrail ·{" "}
                <strong>{result.created}</strong> new ·{" "}
                <strong>{result.adopted}</strong> matched to existing ·{" "}
                <strong>{result.updated}</strong> updated ·{" "}
                {result.unchanged} unchanged
                {result.conflicts > 0 && (
                  <> · <strong>{result.conflicts}</strong> needing a decision</>
                )}
                {result.skipped > 0 && (
                  <> · {result.skipped} skipped (they share an email with another BoldTrail contact)</>
                )}
                {result.remoteDeleted > 0 && (
                  <> · {result.remoteDeleted} gone from BoldTrail (kept here)</>
                )}
              </p>
              <p className="text-xs text-ink-mute mt-1.5">
                {result.detailFetched} full record{result.detailFetched === 1 ? "" : "s"} filled
                in · {result.requests} API request{result.requests === 1 ? "" : "s"} used
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
