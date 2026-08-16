import { FIELD_SYNC_POLICY, DIRECTION_LABEL, type SyncDirection } from "@/lib/boldtrail/policy";

// What syncs and what does not, rendered straight from FIELD_SYNC_POLICY.
//
// Reading from the same array the merge logic uses is the whole point. A legend
// written by hand would eventually promise something the sync stopped doing,
// and the only way anyone would find out is by losing a note or a follow-up
// date they assumed was safe.

const styles: Record<SyncDirection, string> = {
  two_way: "bg-gold/15 text-gold-dark border-gold/40",
  pull_only: "bg-navy/10 text-navy border-navy/25",
  local_only: "bg-cream-200 text-ink-soft border-ink-mute/30",
  unavailable: "bg-burgundy/10 text-burgundy border-burgundy/25",
};

export default function SyncFieldLegend() {
  return (
    <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7">
      <h2 className="font-serif text-lg text-navy mb-1">What actually syncs</h2>
      <p className="text-sm text-ink-mute mb-5 max-w-2xl leading-relaxed">
        BoldTrail has no pipeline to sync with — no deals, opportunities or
        tasks exist in their API at all. So your stages, follow-up dates and
        notes live here and nowhere else. Changing them will not change anything
        in BoldTrail.
      </p>

      <ul className="divide-y divide-gold/15">
        {FIELD_SYNC_POLICY.map((policy) => (
          <li key={policy.field} className="py-3 flex flex-col sm:flex-row sm:gap-4">
            <div className="sm:w-44 shrink-0 flex items-start gap-2 mb-1 sm:mb-0">
              <span className="text-sm text-navy font-medium">{policy.label}</span>
            </div>
            <div className="min-w-0 flex-1">
              <span
                className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider mb-1 ${styles[policy.direction]}`}
              >
                {DIRECTION_LABEL[policy.direction]}
              </span>
              <p className="text-xs text-ink-soft leading-relaxed">{policy.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
