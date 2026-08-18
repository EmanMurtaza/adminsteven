"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Video, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Campaign,
  CampaignInsert,
  CampaignMediaType,
  CAMPAIGN_STATUSES,
  CAMPAIGN_FREQUENCIES,
} from "@/lib/campaigns";

interface Props {
  initialData?: Partial<Campaign>;
  onSubmit: (data: CampaignInsert) => Promise<{ error?: string }>;
}

const inputClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3.5 py-2.5 text-sm placeholder-ink-mute/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition";

const labelClass = "block text-xs font-medium uppercase tracking-wider text-ink-soft mb-2";

// Must match the campaign-media bucket's file_size_limit in supabase/setup.sql.
const MAX_MEDIA_MB = 25;
const MAX_MEDIA_BYTES = MAX_MEDIA_MB * 1024 * 1024;
const MEDIA_BUCKET = "campaign-media";

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export default function CampaignForm({ initialData, onSubmit }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<CampaignInsert>({
    title: initialData?.title ?? "",
    headline: initialData?.headline ?? "",
    body: initialData?.body ?? "",
    media_url: initialData?.media_url ?? null,
    media_type: initialData?.media_type ?? "image",
    cta_text: initialData?.cta_text ?? "",
    cta_url: initialData?.cta_url ?? "",
    status: initialData?.status ?? "draft",
    priority: initialData?.priority ?? 0,
    starts_at: initialData?.starts_at ?? null,
    ends_at: initialData?.ends_at ?? null,
    display_delay_seconds: initialData?.display_delay_seconds ?? 3,
    frequency: initialData?.frequency ?? "once_per_session",
  });

  const set = <K extends keyof CampaignInsert>(key: K, value: CampaignInsert[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const mediaType: CampaignMediaType = file.type.startsWith("video/") ? "video" : "image";

    if (file.size > MAX_MEDIA_BYTES) {
      setError(`That file is over ${MAX_MEDIA_MB} MB — pick a smaller one.`);
      e.target.value = "";
      return;
    }

    setMediaUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? (mediaType === "video" ? "mp4" : "jpg");
    const path = `campaigns/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file);

    if (uploadError) {
      setError("Upload failed: " + uploadError.message);
    } else if (data) {
      const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(data.path);
      set("media_url", urlData.publicUrl);
      set("media_type", mediaType);
    }
    setMediaUploading(false);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.headline.trim()) {
      setError("A name and a headline are both required.");
      return;
    }
    setLoading(true);
    setError(null);

    const result = await onSubmit({
      ...form,
      title: form.title.trim(),
      headline: form.headline.trim(),
      body: form.body?.trim() || null,
      cta_text: form.cta_text?.trim() || null,
      cta_url: form.cta_url?.trim() || null,
    });

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/campaigns");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
      <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 space-y-5">
        <div>
          <label htmlFor="title" className={labelClass}>
            Internal name
          </label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Spring Open House Promo"
            className={inputClass}
            required
          />
          <p className="text-[11px] text-ink-mute mt-1.5">
            For your reference only — visitors never see this.
          </p>
        </div>

        <div>
          <label htmlFor="headline" className={labelClass}>
            Popup headline
          </label>
          <input
            id="headline"
            value={form.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder="Join us this Saturday for an exclusive open house"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="body" className={labelClass}>
            Body text
          </label>
          <textarea
            id="body"
            rows={4}
            value={form.body ?? ""}
            onChange={(e) => set("body", e.target.value)}
            placeholder="A short line or two of supporting copy."
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </div>

        <div>
          <label className={labelClass}>Photo or video</label>
          {form.media_url ? (
            <div className="relative w-full max-w-sm rounded-lg overflow-hidden border border-gold/25">
              {form.media_type === "video" ? (
                <video
                  src={form.media_url}
                  className="w-full h-40 object-cover bg-navy"
                  controls
                  muted
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.media_url} alt="" className="w-full h-40 object-cover" />
              )}
              <button
                type="button"
                onClick={() => set("media_url", null)}
                aria-label="Remove media"
                className="absolute top-2 right-2 bg-navy/80 hover:bg-burgundy text-cream rounded-full p-1.5 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              disabled={mediaUploading}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gold/40 rounded-xl px-6 py-8 w-full max-w-sm hover:border-gold hover:bg-gold/5 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2 text-gold-dark">
                <ImageIcon size={20} />
                <Video size={20} />
              </div>
              <span className="text-xs text-navy font-medium">
                {mediaUploading ? "Uploading…" : "Click to upload a photo or video"}
              </span>
              <span className="text-[11px] text-ink-mute">Optional — up to {MAX_MEDIA_MB} MB</span>
            </button>
          )}
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleMediaUpload}
            className="hidden"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="cta_text" className={labelClass}>
              Button text
            </label>
            <input
              id="cta_text"
              value={form.cta_text ?? ""}
              onChange={(e) => set("cta_text", e.target.value)}
              placeholder="Reserve Your Spot"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="cta_url" className={labelClass}>
              Button link
            </label>
            <input
              id="cta_url"
              type="url"
              value={form.cta_url ?? ""}
              onChange={(e) => set("cta_url", e.target.value)}
              placeholder="https://stevenmoning.vercel.app/contact"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 space-y-5">
        <h2 className="font-serif text-base text-navy">Display rules</h2>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="status" className={labelClass}>
              Status
            </label>
            <select
              id="status"
              value={form.status}
              onChange={(e) => set("status", e.target.value as CampaignInsert["status"])}
              className={inputClass}
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="priority" className={labelClass}>
              Priority
            </label>
            <input
              id="priority"
              type="number"
              value={form.priority}
              onChange={(e) => set("priority", Number(e.target.value) || 0)}
              className={inputClass}
            />
            <p className="text-[11px] text-ink-mute mt-1.5">
              Higher wins if more than one campaign is live at once.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="starts_at" className={labelClass}>
              Starts
            </label>
            <input
              id="starts_at"
              type="datetime-local"
              value={toLocalInput(form.starts_at)}
              onChange={(e) => set("starts_at", fromLocalInput(e.target.value))}
              className={inputClass}
            />
            <p className="text-[11px] text-ink-mute mt-1.5">Leave blank to start immediately.</p>
          </div>
          <div>
            <label htmlFor="ends_at" className={labelClass}>
              Ends
            </label>
            <input
              id="ends_at"
              type="datetime-local"
              value={toLocalInput(form.ends_at)}
              onChange={(e) => set("ends_at", fromLocalInput(e.target.value))}
              className={inputClass}
            />
            <p className="text-[11px] text-ink-mute mt-1.5">Leave blank to run indefinitely.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="display_delay_seconds" className={labelClass}>
              Delay before showing
            </label>
            <div className="flex items-center gap-2">
              <input
                id="display_delay_seconds"
                type="number"
                min={0}
                value={form.display_delay_seconds}
                onChange={(e) => set("display_delay_seconds", Number(e.target.value) || 0)}
                className={inputClass}
              />
              <span className="text-xs text-ink-mute shrink-0">seconds</span>
            </div>
          </div>
          <div>
            <label htmlFor="frequency" className={labelClass}>
              Show
            </label>
            <select
              id="frequency"
              value={form.frequency}
              onChange={(e) => set("frequency", e.target.value as CampaignInsert["frequency"])}
              className={inputClass}
            >
              {CAMPAIGN_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-burgundy bg-burgundy/10 border border-burgundy/30 rounded-lg px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={loading || mediaUploading}
          className="bg-navy hover:bg-navy-500 disabled:opacity-50 text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
        >
          {loading ? "Saving…" : "Save campaign"}
          {!loading && <span className="text-gold">›</span>}
        </button>
        <button
          type="button"
          onClick={() => router.push("/campaigns")}
          className="border border-navy/30 text-navy hover:bg-navy hover:text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
