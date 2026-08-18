import { allRoles, leadTypeLabel, type Contact } from "@/lib/contacts";

/**
 * Every role a contact holds, as one line of pills.
 *
 * Shared by the contacts table, the pipeline card and the alumni list so a
 * contact reads identically wherever they appear. The first version of this put
 * a full-width `<select>` in the cell with the extra roles crammed underneath as
 * grey chips; it was three different shapes in one column and looked like a
 * rendering fault rather than a design.
 *
 * The hierarchy is carried by weight, not by colour alone: the primary role is
 * a filled pill, the rest are hairline outlines. That keeps the column
 * scannable when two thirds of the list is buyer + seller + renter — you read
 * the strong pill and move on, and the outlines are there when you need them.
 */

const primaryStyles: Record<string, string> = {
  buyer: "bg-gold/20 text-gold-dark ring-1 ring-inset ring-gold/45",
  seller: "bg-navy/12 text-navy ring-1 ring-inset ring-navy/30",
  renter: "bg-navy/12 text-navy ring-1 ring-inset ring-navy/30",
  vendor: "bg-navy/12 text-navy ring-1 ring-inset ring-navy/30",
  // Agents are not leads — a distinct colour stops them being worked as one.
  agent: "bg-burgundy/12 text-burgundy ring-1 ring-inset ring-burgundy/30",
  unknown: "bg-cream-200 text-ink-mute ring-1 ring-inset ring-ink-mute/20",
};

const secondaryStyle =
  "text-ink-soft ring-1 ring-inset ring-ink-mute/25 bg-transparent";

const base =
  "inline-flex items-center rounded-full px-2 py-[3px] text-[10px] font-medium leading-none whitespace-nowrap";

export default function RoleBadges({
  contact,
  className = "",
}: {
  contact: Pick<Contact, "lead_type" | "deal_types">;
  className?: string;
}) {
  const roles = allRoles(contact);

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {roles.map((role, i) => (
        <span
          key={role}
          className={`${base} ${
            i === 0 ? primaryStyles[role] ?? primaryStyles.unknown : secondaryStyle
          }`}
          // The distinction is visual, so it needs saying out loud for anyone
          // reading this with a screen reader.
          title={i === 0 ? `${leadTypeLabel(role)} (primary)` : leadTypeLabel(role)}
        >
          {leadTypeLabel(role)}
        </span>
      ))}
    </div>
  );
}
