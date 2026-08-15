"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Listing,
  ListingInsert,
  PROPERTY_TYPES,
  SALES_CHANNELS,
  DEFAULT_SALES_CHANNEL,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { ImageIcon, X } from "lucide-react";

interface ListingFormProps {
  initialData?: Partial<Listing>;
  onSubmit: (data: ListingInsert) => Promise<{ error?: string }>;
}

const inputClass =
  "w-full bg-cream-100 border border-gold/30 text-navy rounded-md px-3.5 py-2.5 text-sm placeholder-ink-mute/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition";

const labelClass =
  "block text-xs font-medium uppercase tracking-wider text-ink-soft mb-2";

// Hard per-image size cap. Must match the bucket's file_size_limit set in
// supabase/create_property_images_bucket.sql (5 MB). This client check just
// gives instant feedback; Storage enforces the real limit server-side.
const MAX_IMAGE_MB = 5;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const PROPERTY_BUCKET = "property-images";

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function ListingForm({ initialData, onSubmit }: ListingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ListingInsert>({
    title: initialData?.title ?? "",
    slug: initialData?.slug ?? "",
    description: initialData?.description ?? "",
    property_type: initialData?.property_type ?? "luxury",
    sales_channel: initialData?.sales_channel ?? DEFAULT_SALES_CHANNEL,
    status: initialData?.status ?? "draft",
    is_featured: initialData?.is_featured ?? false,
    address: initialData?.address ?? "",
    city: initialData?.city ?? "",
    state: initialData?.state ?? "TX",
    zip_code: initialData?.zip_code ?? "",
    neighborhood: initialData?.neighborhood ?? "",
    price: initialData?.price ?? null,
    bedrooms: initialData?.bedrooms ?? null,
    bathrooms: initialData?.bathrooms ?? null,
    square_footage: initialData?.square_footage ?? null,
    lot_size_acres: initialData?.lot_size_acres ?? null,
    year_built: initialData?.year_built ?? null,
    garage_spaces: initialData?.garage_spaces ?? null,
    pool: initialData?.pool ?? false,
    images: initialData?.images ?? [],
    virtual_tour_url: initialData?.virtual_tour_url ?? "",
    mls_number: initialData?.mls_number ?? "",
  });

  const set = (field: keyof ListingInsert, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function handleTitleChange(title: string) {
    set("title", title);
    if (!initialData?.slug) {
      set("slug", slugify(title));
    }
  }

  const num = (v: string) => (v === "" ? null : Number(v));

  // Raw land has no beds/baths/interior, so we hide those fields for it.
  const isLand = form.property_type === "land";

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);

    // Reject oversized files up front (Storage also enforces this server-side).
    const tooBig = files.filter((f) => f.size > MAX_IMAGE_BYTES);
    const valid = files.filter((f) => f.size <= MAX_IMAGE_BYTES);
    if (tooBig.length > 0) {
      setError(
        `Skipped ${tooBig.length} image(s) over ${MAX_IMAGE_MB} MB: ` +
          tooBig.map((f) => f.name).join(", ")
      );
    }
    if (valid.length === 0) {
      e.target.value = "";
      return;
    }

    setImageUploading(true);
    const supabase = createClient();
    const uploaded: string[] = [];
    for (const file of valid) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `listings/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error: uploadError } = await supabase.storage
        .from(PROPERTY_BUCKET)
        .upload(path, file);
      if (uploadError) {
        setError("Image upload failed: " + uploadError.message);
        continue;
      }
      if (data) {
        const { data: urlData } = supabase.storage
          .from(PROPERTY_BUCKET)
          .getPublicUrl(data.path);
        uploaded.push(urlData.publicUrl);
      }
    }
    setForm((prev) => ({ ...prev, images: [...(prev.images ?? []), ...uploaded] }));
    setImageUploading(false);
    e.target.value = "";
  }

  function removeImage(url: string) {
    setForm((prev) => ({
      ...prev,
      images: (prev.images ?? []).filter((u) => u !== url),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Normalize empty strings to null for optional text columns
    const payload: ListingInsert = {
      ...form,
      slug: form.slug || null,
      description: form.description || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      zip_code: form.zip_code || null,
      neighborhood: form.neighborhood || null,
      virtual_tour_url: form.virtual_tour_url || null,
      mls_number: form.mls_number || null,
      // For land, drop residential details so stale values aren't persisted
      // (e.g. a home reclassified as land keeping its old bed/bath counts).
      ...(isLand
        ? {
            bedrooms: null,
            bathrooms: null,
            square_footage: null,
            year_built: null,
            garage_spaces: null,
            pool: false,
          }
        : {}),
    };
    const result = await onSubmit(payload);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push("/listings");
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 sm:space-y-6 max-w-2xl bg-white border border-gold/25 rounded-xl p-5 sm:p-7 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]"
    >
      {error && (
        <div className="bg-burgundy/5 border border-burgundy/30 text-burgundy text-sm px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div>
        <label className={labelClass}>Title *</label>
        <input
          required
          type="text"
          value={form.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className={inputClass}
          placeholder="e.g. Luxury Estate in Highland Park"
        />
      </div>

      <div>
        <label className={labelClass}>Slug (URL)</label>
        <input
          type="text"
          value={form.slug ?? ""}
          onChange={(e) => set("slug", slugify(e.target.value))}
          className={inputClass}
          placeholder="luxury-estate-in-highland-park"
        />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          rows={4}
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          className={inputClass}
          placeholder="A captivating overview of the property…"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div>
          <label className={labelClass}>Property Type *</label>
          <select
            value={form.property_type}
            onChange={(e) => set("property_type", e.target.value)}
            className={inputClass}
          >
            {PROPERTY_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* The sub-category is a second axis, not a narrowing of the type above:
            every property type can be sold through any of these channels. */}
        <div>
          <label className={labelClass}>Sub-category *</label>
          <select
            value={form.sales_channel ?? DEFAULT_SALES_CHANNEL}
            onChange={(e) => set("sales_channel", e.target.value)}
            className={inputClass}
          >
            {SALES_CHANNELS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-mute">
            {SALES_CHANNELS.find((c) => c.value === form.sales_channel)?.hint ??
              SALES_CHANNELS[0].hint}
          </p>
        </div>

        <div>
          <label className={labelClass}>Status</label>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            className={inputClass}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Price</label>
          <input
            type="number"
            min={0}
            step="any"
            value={form.price ?? ""}
            onChange={(e) => set("price", num(e.target.value))}
            className={inputClass}
            placeholder="0"
          />
        </div>
      </div>

      {/* Location */}
      <fieldset className="space-y-4 border-t border-gold/15 pt-4">
        <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-dark pt-4">
          Location
        </legend>
        <div>
          <label className={labelClass}>Street Address</label>
          <input
            type="text"
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
            className={inputClass}
            placeholder="123 Main St"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="col-span-2 sm:col-span-2">
            <label className={labelClass}>City</label>
            <input
              type="text"
              value={form.city ?? ""}
              onChange={(e) => set("city", e.target.value)}
              className={inputClass}
              placeholder="Dallas"
            />
          </div>
          <div>
            <label className={labelClass}>State</label>
            <input
              type="text"
              value={form.state ?? ""}
              onChange={(e) => set("state", e.target.value)}
              className={inputClass}
              placeholder="TX"
            />
          </div>
          <div>
            <label className={labelClass}>ZIP</label>
            <input
              type="text"
              value={form.zip_code ?? ""}
              onChange={(e) => set("zip_code", e.target.value)}
              className={inputClass}
              placeholder="75201"
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Neighborhood</label>
          <input
            type="text"
            value={form.neighborhood ?? ""}
            onChange={(e) => set("neighborhood", e.target.value)}
            className={inputClass}
            placeholder="Highland Park"
          />
        </div>
      </fieldset>

      {/* Details */}
      <fieldset className="space-y-4 border-t border-gold/15 pt-4">
        <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-dark pt-4">
          {isLand ? "Land Details" : "Details"}
        </legend>
        {isLand && (
          <p className="text-xs text-ink-mute -mt-1">
            Residential fields (beds, baths, interior sq ft, year built,
            garage, pool) are hidden for land listings.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {!isLand && (
            <>
              <div>
                <label className={labelClass}>Beds</label>
                <input
                  type="number"
                  min={0}
                  value={form.bedrooms ?? ""}
                  onChange={(e) => set("bedrooms", num(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Baths</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.bathrooms ?? ""}
                  onChange={(e) => set("bathrooms", num(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Sq Ft</label>
                <input
                  type="number"
                  min={0}
                  value={form.square_footage ?? ""}
                  onChange={(e) => set("square_footage", num(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Year Built</label>
                <input
                  type="number"
                  min={1800}
                  max={2100}
                  value={form.year_built ?? ""}
                  onChange={(e) => set("year_built", num(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Garage</label>
                <input
                  type="number"
                  min={0}
                  value={form.garage_spaces ?? ""}
                  onChange={(e) => set("garage_spaces", num(e.target.value))}
                  className={inputClass}
                />
              </div>
            </>
          )}
          <div>
            <label className={labelClass}>Lot (acres)</label>
            <input
              type="number"
              min={0}
              step="any"
              value={form.lot_size_acres ?? ""}
              onChange={(e) => set("lot_size_acres", num(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>MLS #</label>
            <input
              type="text"
              value={form.mls_number ?? ""}
              onChange={(e) => set("mls_number", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Virtual Tour URL</label>
          <input
            type="url"
            value={form.virtual_tour_url ?? ""}
            onChange={(e) => set("virtual_tour_url", e.target.value)}
            className={inputClass}
            placeholder="https://…"
          />
        </div>
        <div className="flex flex-wrap gap-6 pt-1">
          {!isLand && (
            <label className="flex items-center gap-2.5 text-sm text-navy cursor-pointer">
              <input
                type="checkbox"
                checked={form.pool ?? false}
                onChange={(e) => set("pool", e.target.checked)}
                className="w-4 h-4 accent-[#d4a84b]"
              />
              Pool
            </label>
          )}
          <label className="flex items-center gap-2.5 text-sm text-navy cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_featured ?? false}
              onChange={(e) => set("is_featured", e.target.checked)}
              className="w-4 h-4 accent-[#d4a84b]"
            />
            Featured on homepage
          </label>
        </div>
      </fieldset>

      {/* Photos */}
      <fieldset className="space-y-4 border-t border-gold/15 pt-4">
        <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-dark pt-4">
          Photos
        </legend>
        {(form.images?.length ?? 0) > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {form.images?.map((url, i) => (
              <div
                key={url}
                className="relative rounded-lg overflow-hidden border border-gold/25 group aspect-[4/3]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Listing photo ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {i === 0 && (
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-navy/80 text-cream text-[9px] rounded uppercase tracking-wider">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  className="absolute top-1 right-1 p-1 bg-burgundy/90 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-burgundy"
                  aria-label="Remove photo"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={imageUploading}
          className="w-full h-28 border-2 border-dashed border-gold/35 rounded-lg text-ink-mute hover:border-gold hover:text-navy transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-50"
        >
          <ImageIcon size={22} className="text-gold/60" />
          <span className="text-sm">
            {imageUploading ? "Uploading…" : "Upload photos"}
          </span>
          <span className="text-xs text-ink-mute/70">
            Select one or more images — the first is used as the cover · max{" "}
            {MAX_IMAGE_MB} MB each
          </span>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="hidden"
        />
      </fieldset>

      <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gold/15">
        <button
          type="submit"
          disabled={loading}
          className="bg-navy hover:bg-navy-500 text-cream px-6 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          <span>{loading ? "Saving…" : "Save Listing"}</span>
          {!loading && <span className="text-gold">›</span>}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="border border-navy/30 text-navy hover:bg-navy hover:text-cream hover:border-navy px-6 py-2.5 rounded-md text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
