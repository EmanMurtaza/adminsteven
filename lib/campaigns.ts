// Popup campaigns — announcements the public site (stevenmoning.vercel.app)
// shows in a modal shortly after a visitor opens the homepage. Managed here,
// served to the public site via GET /api/campaigns (see that route for the
// "which one is live right now" selection logic).

export type CampaignStatus = "draft" | "published" | "archived";

export const CAMPAIGN_STATUSES: { value: CampaignStatus; label: string }[] = [
  { value: "draft", label: "Draft — not shown" },
  { value: "published", label: "Live — eligible to show" },
  { value: "archived", label: "Archived" },
];

export type CampaignFrequency = "once_per_session" | "once_per_visitor" | "every_visit";

export const CAMPAIGN_FREQUENCIES: { value: CampaignFrequency; label: string }[] = [
  { value: "once_per_session", label: "Once per browser session" },
  { value: "once_per_visitor", label: "Once per visitor" },
  { value: "every_visit", label: "Every visit" },
];

export type CampaignMediaType = "image" | "video";

export interface Campaign {
  id: string;
  /** Internal name — never shown to visitors. */
  title: string;
  headline: string;
  body: string | null;
  media_url: string | null;
  media_type: CampaignMediaType;
  cta_text: string | null;
  cta_url: string | null;
  status: CampaignStatus;
  /** Higher wins when more than one campaign is live at once. */
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  display_delay_seconds: number;
  frequency: CampaignFrequency;
  created_at: string;
  updated_at: string;
}

export interface CampaignInsert {
  title: string;
  headline: string;
  body?: string | null;
  media_url?: string | null;
  media_type: CampaignMediaType;
  cta_text?: string | null;
  cta_url?: string | null;
  status: CampaignStatus;
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  display_delay_seconds: number;
  frequency: CampaignFrequency;
}

export type CampaignUpdate = Partial<CampaignInsert>;

export function statusLabel(status: string): string {
  return CAMPAIGN_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function frequencyLabel(frequency: string): string {
  return CAMPAIGN_FREQUENCIES.find((f) => f.value === frequency)?.label ?? frequency;
}

/** Whether this campaign would show to a visitor right now. */
export function isLiveNow(
  c: Pick<Campaign, "status" | "starts_at" | "ends_at">,
  now: Date = new Date()
): boolean {
  if (c.status !== "published") return false;
  if (c.starts_at && new Date(c.starts_at) > now) return false;
  if (c.ends_at && new Date(c.ends_at) < now) return false;
  return true;
}
