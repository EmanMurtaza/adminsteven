// Buyer and seller enquiries.
//
// These live in the `contact_submissions` table on Supabase — the table that
// already existed for exactly this purpose. The public site writes to it from
// the buyer and seller forms; nothing else does.
//
// The site packs each form's qualifying answers into `message` as a block of
// "Label: value" lines, because the table has no columns for them. Rather than
// showing Steven a wall of text, `parseInquiryMessage` unpacks it again.

export type InquirySource = "buyer" | "seller";

export interface Inquiry {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  /** 'buyer' | 'seller' from the forms. Older rows may hold anything, or null. */
  source: string | null;
  is_read: boolean;
  created_at: string;
}

export const SOURCE_LABELS: Record<string, string> = {
  buyer: "Buyer",
  seller: "Seller",
};

export function sourceLabel(source: string | null): string {
  if (!source) return "Unknown";
  return SOURCE_LABELS[source] ?? source;
}

export interface ParsedInquiry {
  /** The dropdown/text answers, in the order they were asked. */
  answers: { label: string; value: string }[];
  /** Whatever they typed in the free-text box. */
  note: string | null;
  /** utm_source, the referring host, or 'direct'. */
  cameFrom: string | null;
}

const CAME_FROM = /^—\s*came from:\s*(.+)$/;

export function parseInquiryMessage(message: string | null): ParsedInquiry {
  const empty: ParsedInquiry = { answers: [], note: null, cameFrom: null };
  if (!message?.trim()) return empty;

  const lines = message.split("\n");
  const answers: { label: string; value: string }[] = [];

  // Answers are the leading run of "Label: value" lines. Stop at the first line
  // that is not one — everything after that is the person's own message, which
  // may well contain colons of its own.
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      if (answers.length) {
        i++;
        break;
      }
      continue;
    }
    const match = line.match(/^([^:]{1,60}):\s*(.+)$/);
    if (!match) break;
    answers.push({ label: match[1].trim(), value: match[2].trim() });
  }

  let cameFrom: string | null = null;
  const rest: string[] = [];
  for (const line of lines.slice(i)) {
    const match = line.match(CAME_FROM);
    if (match) cameFrom = match[1].trim();
    else rest.push(line);
  }

  return { answers, note: rest.join("\n").trim() || null, cameFrom };
}

/** Short preview for the collapsed table row. */
export function inquirySummary(inquiry: Inquiry): string {
  const { answers, note } = parseInquiryMessage(inquiry.message);
  if (note) return note;
  if (answers.length) return answers.map((a) => a.value).join(" · ");
  return "—";
}
