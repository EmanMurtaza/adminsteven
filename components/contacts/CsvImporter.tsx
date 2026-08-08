"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { readCsvTable } from "@/lib/csv";
import {
  ContactDraft,
  IMPORT_FIELDS,
  ImportPreview,
  Mapping,
  guessMapping,
  previewImport,
} from "@/lib/contacts";

interface Props {
  onImport: (input: {
    drafts: ContactDraft[];
    fileName: string;
    source: string;
    skippedCount: number;
  }) => Promise<{ inserted?: number; updated?: number; error?: string }>;
}

const selectClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent";

export default function CsvImporter({ onImport }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [source, setSource] = useState("boldtrail");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ inserted: number; updated: number } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(null);

    const text = await file.text();
    const table = readCsvTable(text);

    if (!table.headers.length || !table.rows.length) {
      setError("That file has no rows we can read. Is it a CSV with a header line?");
      setFileName(null);
      setHeaders([]);
      setRows([]);
      return;
    }

    setFileName(file.name);
    setHeaders(table.headers);
    setRows(table.rows);
    setMapping(guessMapping(table.headers));
  }

  // Recomputed on every mapping change so the preview always matches what will
  // actually be written.
  const { preview, drafts }: { preview: ImportPreview; drafts: ContactDraft[] } =
    headers.length
      ? previewImport(rows, headers, mapping, { source })
      : { preview: { total: 0, importable: 0, skipped: [], duplicatesInFile: 0, sample: [] }, drafts: [] };

  function setColumn(index: number, key: string) {
    setMapping((prev) => {
      const next: Mapping = { ...prev, [index]: key || null };
      // A field can only come from one column — clear any other column holding it.
      if (key) {
        for (const [i, k] of Object.entries(prev)) {
          if (k === key && Number(i) !== index) next[Number(i)] = null;
        }
      }
      return next;
    });
  }

  async function handleImport() {
    if (!drafts.length) return;
    setBusy(true);
    setError(null);
    const result = await onImport({
      drafts,
      fileName: fileName ?? "",
      source,
      skippedCount: preview.skipped.length,
    });
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setDone({ inserted: result.inserted ?? 0, updated: result.updated ?? 0 });
    router.refresh();
  }

  function reset() {
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setDone(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  if (done) {
    return (
      <div className="bg-white border border-gold/25 rounded-xl p-8 text-center">
        <CheckCircle2 className="mx-auto text-gold-dark mb-3" size={40} />
        <p className="font-serif text-2xl text-navy mb-2">Import finished</p>
        <p className="text-sm text-ink-soft mb-6">
          <span className="font-semibold text-navy">{done.inserted}</span> new contact
          {done.inserted === 1 ? "" : "s"} added,{" "}
          <span className="font-semibold text-navy">{done.updated}</span> existing
          {done.updated === 1 ? " one" : " ones"} updated.
        </p>
        <div className="flex gap-3 justify-center">
          <a
            href="/contacts"
            className="bg-navy hover:bg-navy-500 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
          >
            View contacts
          </a>
          <button
            onClick={reset}
            className="border border-navy/30 text-navy hover:bg-navy hover:text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
          >
            Import another file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Step 1 — file */}
      <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7">
        <h2 className="font-serif text-lg text-navy mb-1">1 · Choose the file</h2>
        <p className="text-sm text-ink-mute mb-5">
          Export your contacts from BoldTrail (or any spreadsheet) as CSV, then pick
          the file here. Nothing is saved until you confirm.
        </p>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gold/40 rounded-xl px-6 py-10 cursor-pointer hover:border-gold hover:bg-gold/5 transition-colors">
          <Upload size={26} className="text-gold-dark" />
          <span className="text-sm font-medium text-navy">
            {fileName ?? "Click to choose a CSV file"}
          </span>
          <span className="text-xs text-ink-mute">
            {fileName ? `${rows.length} rows read` : "Comma-separated, first row is the header"}
          </span>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="hidden"
          />
        </label>
      </div>

      {headers.length > 0 && (
        <>
          {/* Step 2 — mapping */}
          <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7">
            <h2 className="font-serif text-lg text-navy mb-1">2 · Match the columns</h2>
            <p className="text-sm text-ink-mute mb-5">
              We guessed these from the header names. Change anything that looks
              wrong, and set columns you do not need to <em>Ignore</em>.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {headers.map((header, i) => (
                <div key={`${header}-${i}`}>
                  <label className="block text-xs font-medium text-navy mb-1.5 truncate" title={header}>
                    {header || <span className="text-ink-mute">(unnamed column)</span>}
                  </label>
                  <select
                    value={mapping[i] ?? ""}
                    onChange={(e) => setColumn(i, e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Ignore this column</option>
                    {IMPORT_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-ink-mute mt-1 truncate" title={rows[0]?.[i]}>
                    e.g. {rows[0]?.[i] || "—"}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-5 border-t border-gold/15 max-w-xs">
              <label className="block text-xs font-medium text-navy mb-1.5">
                Label these contacts as coming from
              </label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
              />
              <p className="text-[11px] text-ink-mute mt-1">
                Only used when the file has no source column of its own.
              </p>
            </div>
          </div>

          {/* Step 3 — preview */}
          <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7">
            <h2 className="font-serif text-lg text-navy mb-1">3 · Check, then import</h2>
            <p className="text-sm text-ink-mute mb-5">
              Contacts are matched on email. An existing contact is updated rather
              than duplicated, and their stage, notes and follow-up date are left
              alone.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <Stat label="Rows in file" value={preview.total} />
              <Stat label="Will import" value={preview.importable} highlight />
              <Stat label="Skipped" value={preview.skipped.length} />
            </div>

            {preview.duplicatesInFile > 0 && (
              <p className="text-xs text-ink-soft mb-4">
                {preview.duplicatesInFile} row
                {preview.duplicatesInFile === 1 ? " shares an email with another" : "s share emails with others"}{" "}
                in this file — the last one wins.
              </p>
            )}

            {preview.skipped.length > 0 && (
              <div className="mb-5 border border-gold/30 bg-gold/5 rounded-lg p-3.5">
                <p className="flex items-center gap-2 text-xs font-semibold text-navy mb-2">
                  <AlertTriangle size={14} className="text-gold-dark" />
                  These rows will be skipped
                </p>
                <ul className="text-xs text-ink-soft space-y-0.5 max-h-32 overflow-y-auto">
                  {preview.skipped.slice(0, 20).map((s) => (
                    <li key={s.row}>
                      Row {s.row}: {s.reason}
                    </li>
                  ))}
                  {preview.skipped.length > 20 && (
                    <li className="text-ink-mute">…and {preview.skipped.length - 20} more</li>
                  )}
                </ul>
              </div>
            )}

            {preview.sample.length > 0 && (
              <div className="mb-5 overflow-x-auto">
                <p className="text-xs font-semibold text-navy mb-2">First few, as they will be saved</p>
                <table className="w-full text-xs border border-gold/20 rounded-lg overflow-hidden">
                  <thead className="bg-cream-100 text-ink-mute">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gold/10">
                    {preview.sample.map((c, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-navy">
                          {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{c.email ?? "—"}</td>
                        <td className="px-3 py-2 text-ink-soft">{c.phone ?? "—"}</td>
                        <td className="px-3 py-2 text-ink-soft">{c.lead_type}</td>
                        <td className="px-3 py-2 text-ink-soft">{c.stage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && (
              <p className="mb-4 text-sm text-burgundy bg-burgundy/10 border border-burgundy/30 rounded-lg px-3.5 py-2.5">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleImport}
                disabled={busy || preview.importable === 0}
                className="bg-navy hover:bg-navy-500 disabled:opacity-40 disabled:cursor-not-allowed text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                {busy ? "Importing…" : `Import ${preview.importable} contacts`}
                {!busy && <span className="text-gold">›</span>}
              </button>
              <button
                onClick={reset}
                disabled={busy}
                className="border border-navy/30 text-navy hover:bg-navy hover:text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
              >
                Start over
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${highlight ? "border-gold bg-gold/5" : "border-gold/25 bg-cream-100"}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-mute">{label}</p>
      <p className="font-serif text-2xl text-navy mt-1">{value}</p>
    </div>
  );
}
