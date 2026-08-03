// A small RFC 4180 CSV reader.
//
// Deliberately hand-rolled rather than pulling in a parser dependency: the
// whole grammar is quotes, commas and newlines, and the cases that actually
// break naive `split(",")` — a quoted field containing a comma, a quoted field
// containing a line break, and "" as an escaped quote — are all handled below.
// Real BoldTrail and Zillow exports contain all three.

/** Split raw CSV text into rows of fields. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  // Excel writes a UTF-8 BOM; left in place it corrupts the first header name.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Normalise line endings up front so a multi-line quoted value does not keep
  // stray \r characters that then show up in the stored note.
  text = text.replace(/\r\n/g, "\n");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // "" is a literal quote
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      // Newlines inside quotes are part of the value, not a row break.
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\r") {
      i++; // CRLF — the \n does the work
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += c;
      i++;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely empty (trailing newlines, blank separator lines).
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

/** First row is treated as the header. Returns empty headers for empty input. */
export function readCsvTable(text: string): CsvTable {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], rows: [] };
  const [headers, ...rest] = rows;
  return {
    headers: headers.map((h) => h.trim()),
    // Pad short rows so every row lines up with the header.
    rows: rest.map((r) =>
      r.length === headers.length
        ? r
        : Array.from({ length: headers.length }, (_, i) => r[i] ?? "")
    ),
  };
}
