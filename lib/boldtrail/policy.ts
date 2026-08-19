// What syncs, in which direction, and why.
//
// This array is the single source of truth: the merge logic in sync.ts reads it
// to decide what to apply, and the UI legend renders from the same rows. That
// coupling is the point — a legend maintained separately would eventually claim
// something the sync does not do, and the user would only find out by losing
// work.

export type SyncDirection =
  /** BoldTrail can change it, and so can we; changes flow both ways. */
  | "two_way"
  /** Read from BoldTrail, never sent back. */
  | "pull_only"
  /** Ours alone. BoldTrail never sees it and never overwrites it. */
  | "local_only"
  /** Their API has no way to write this, whatever we would like. */
  | "unavailable";

export interface FieldPolicy {
  field: string;
  label: string;
  direction: SyncDirection;
  /** Shown in the UI legend. Written for Steven, not for a developer. */
  note: string;
}

export const FIELD_SYNC_POLICY: FieldPolicy[] = [
  {
    field: "first_name",
    label: "First name",
    direction: "two_way",
    note: "Kept in step both ways. If it was changed in both places since the last sync, yours is kept and the difference is flagged for you to settle.",
  },
  {
    field: "last_name",
    label: "Last name",
    direction: "two_way",
    note: "Same as first name.",
  },
  {
    field: "email",
    label: "Email",
    direction: "two_way",
    note: "Also how a contact is matched up the first time, so an existing contact is adopted rather than duplicated.",
  },
  {
    field: "phone",
    label: "Phone",
    direction: "two_way",
    note: "BoldTrail keeps several numbers; the mobile is used as the main one.",
  },
  {
    field: "tags",
    label: "Tags",
    direction: "pull_only",
    note: "Tags are added, never removed — deleting one in BoldTrail will not delete it here. Sending tags back is not enabled yet: their API accepted the request but rejected the format, and that needs a live call to work out.",
  },
  {
    field: "lead_type",
    label: "Buyer / seller",
    direction: "pull_only",
    note: "Taken from their deal type when a contact first arrives. After that your choice wins and is never overwritten.",
  },
  {
    field: "source",
    label: "Source",
    direction: "pull_only",
    note: "Set once when the contact is first linked.",
  },
  {
    field: "rating",
    label: "Rating",
    direction: "pull_only",
    note: "Read from BoldTrail. Changing it here does not change it there.",
  },
  {
    field: "email_opt_in",
    label: "Email opt-in",
    direction: "pull_only",
    note: "Read from BoldTrail so campaigns can respect it. Never sent back — consent is theirs to record.",
  },
  {
    field: "assigned_agent",
    label: "Assigned agent",
    direction: "pull_only",
    note: "Read only.",
  },
  {
    field: "stage",
    label: "Stage",
    direction: "pull_only",
    note: "Set from BoldTrail's lead status when a contact first arrives — New Lead, Prospect, Sphere, Active Lead, Client, Contract, Closed or Archived. After that the pipeline is yours: moving a card is never overwritten by a later sync, and never sent back to BoldTrail either.",
  },
  {
    field: "next_follow_up",
    label: "Follow-up date",
    direction: "local_only",
    note: "Lives only here. BoldTrail is never told about it.",
  },
  {
    field: "last_contacted_at",
    label: "Last contacted",
    direction: "pull_only",
    note: "Seeded from BoldTrail's record of a real call or a hand-written note, and never cleared by a sync — marking someone contacted here is a fact BoldTrail does not have. Their campaign log is deliberately ignored: almost every contact is in one, and \"a bulk email went out\" is not a follow-up.",
  },
  {
    field: "notes",
    label: "Notes",
    direction: "local_only",
    note: "Your notes stay here and are never sent. BoldTrail does have a notes endpoint, but theirs is an append-only activity log rather than one editable note, so the two do not map onto each other cleanly. Anything they hold is kept alongside for reference.",
  },
];

export const POLICY_BY_FIELD: Record<string, FieldPolicy> = Object.fromEntries(
  FIELD_SYNC_POLICY.map((p) => [p.field, p])
);

/** Fields a pull is allowed to write. Everything else is left alone. */
export const PULLABLE_FIELDS = FIELD_SYNC_POLICY.filter(
  (p) => p.direction === "two_way" || p.direction === "pull_only"
).map((p) => p.field);

/**
 * Fields whose local value is compared against `local_hash` to decide whether
 * Steven has edited this contact since the last sync.
 *
 * Only two-way fields belong here. A local-only field changing is not a reason
 * to push anything, and including one would queue a pointless write on every
 * note edit.
 */
export const LOCALLY_TRACKED_FIELDS = FIELD_SYNC_POLICY.filter(
  (p) => p.direction === "two_way"
).map((p) => p.field);

export const DIRECTION_LABEL: Record<SyncDirection, string> = {
  two_way: "Both ways",
  pull_only: "BoldTrail → here",
  local_only: "Here only — never sent",
  unavailable: "Not possible in their API",
};
