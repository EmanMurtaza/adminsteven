"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Users } from "lucide-react";
import { formatDate, formatPrice } from "@/lib/format";
import { stageLabel } from "@/lib/contacts";

export interface LinkedContact {
  id: string;
  name: string;
  email: string | null;
  stage: string;
  role: string;
  next_follow_up: string | null;
}

interface Props {
  status: string;
  soldAt: string | null;
  soldPrice: number | null;
  askingPrice: number | null;
  linked: LinkedContact[];
  onMarkSold: (input: {
    sold_price: number | null;
    sold_at: string | null;
  }) => Promise<{ error?: string }>;
  onCloseAsBuyer: (contactId: string) => Promise<{ error?: string }>;
  onScheduleFollowUps: () => Promise<{ scheduled?: number; error?: string }>;
}

const inputClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent";

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

export default function SoldPanel({
  status,
  soldAt,
  soldPrice,
  askingPrice,
  linked,
  onMarkSold,
  onCloseAsBuyer,
  onScheduleFollowUps,
}: Props) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const isSold = status === "sold";

  async function run(key: string, fn: () => Promise<{ error?: string }>) {
    setBusy(key);
    setError(null);
    setNote(null);
    const result = await fn();
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 space-y-5 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
      {isSold ? (
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="text-burgundy shrink-0 mt-0.5" />
          <div>
            <p className="font-serif text-lg text-navy">Sold</p>
            <p className="text-sm text-ink-soft mt-0.5">
              {soldAt ? formatDate(soldAt) : "date not recorded"}
              {soldPrice != null && <> · {formatPrice(soldPrice)}</>}
              {soldPrice != null && askingPrice != null && askingPrice > 0 && (
                <span className="text-ink-mute">
                  {" "}
                  ({soldPrice >= askingPrice ? "+" : ""}
                  {Math.round(((soldPrice - askingPrice) / askingPrice) * 100)}% vs asking)
                </span>
              )}
            </p>
            <p className="text-xs text-ink-mute mt-2 leading-relaxed">
              It is off the website and out of the Active list, but nothing was
              deleted — the sale price and days on market are kept as comp data.
            </p>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="font-serif text-lg text-navy mb-1">Mark as sold</h2>
          <p className="text-sm text-ink-mute mb-4">
            Takes it off the website and out of the Active list. Nothing is
            deleted, and you can still find it on the Sold tab.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-md">
            <div>
              <label className="block text-xs font-medium text-navy mb-1.5">
                Sale price
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={askingPrice != null ? String(askingPrice) : "0"}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy mb-1.5">
                Sale date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <button
            onClick={() =>
              run("sold", () =>
                onMarkSold({
                  sold_price: price.trim() === "" ? null : Number(price),
                  sold_at: date ? new Date(date).toISOString() : null,
                })
              )
            }
            disabled={busy !== null}
            className="mt-4 bg-navy hover:bg-navy-500 disabled:opacity-40 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
          >
            {busy === "sold" ? "Saving…" : "Mark as sold"}
          </button>
        </div>
      )}

      {linked.length > 0 && (
        <div className="border-t border-gold/20 pt-5">
          <p className="flex items-center gap-2 font-serif text-base text-navy mb-1">
            <Users size={16} className="text-gold-dark" />
            {linked.length} contact{linked.length === 1 ? "" : "s"} attached to this
            listing
          </p>
          {/* Nothing here happens automatically. Someone who enquired about a
              property that sold to a different buyer is still an active buyer —
              closing them off would bury a live lead, so the decision stays
              with Steven. */}
          <p className="text-xs text-ink-mute mb-4 leading-relaxed">
            None of these change on their own. Only one of them bought it; the
            rest are still looking.
          </p>

          <ul className="space-y-2">
            {linked.map((c) => (
              <li
                key={`${c.id}-${c.role}`}
                className="flex flex-wrap items-center justify-between gap-2 bg-cream-100 border border-gold/20 rounded-lg px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-navy truncate">
                    {c.name}
                    <span className="text-[10px] uppercase tracking-wider text-ink-mute ml-2">
                      {c.role}
                    </span>
                  </p>
                  <p className="text-xs text-ink-mute truncate">
                    {stageLabel(c.stage)}
                    {c.next_follow_up && <> · follow up {formatDate(c.next_follow_up)}</>}
                    {c.email && <> · {c.email}</>}
                  </p>
                </div>
                {isSold && c.stage !== "closed" && (
                  <button
                    onClick={() => run(`buyer-${c.id}`, () => onCloseAsBuyer(c.id))}
                    disabled={busy !== null}
                    className="text-xs border border-navy/30 text-navy hover:bg-navy hover:text-cream px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 shrink-0"
                  >
                    {busy === `buyer-${c.id}` ? "Saving…" : "This one bought it"}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {isSold && (
            <button
              onClick={async () => {
                setBusy("followups");
                setError(null);
                setNote(null);
                const result = await onScheduleFollowUps();
                setBusy(null);
                if (result.error) return setError(result.error);
                setNote(
                  result.scheduled
                    ? `Follow-up set for ${result.scheduled} contact${result.scheduled === 1 ? "" : "s"}.`
                    : "Everyone already had a follow-up date — nothing changed."
                );
                router.refresh();
              }}
              disabled={busy !== null}
              className="mt-3 text-xs border border-navy/30 text-navy hover:bg-navy hover:text-cream px-3.5 py-2 rounded-md transition-colors disabled:opacity-40"
            >
              {busy === "followups"
                ? "Saving…"
                : "Set a follow-up next week for the ones still looking"}
            </button>
          )}
        </div>
      )}

      {note && <p className="text-sm text-navy bg-gold/10 border border-gold/30 rounded-lg px-3.5 py-2.5">{note}</p>}
      {error && (
        <p className="text-sm text-burgundy bg-burgundy/10 border border-burgundy/30 rounded-lg px-3.5 py-2.5">
          {error}
        </p>
      )}
    </div>
  );
}
