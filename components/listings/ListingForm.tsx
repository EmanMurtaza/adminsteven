"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Listing, ListingInsert } from "@/lib/types";

interface ListingFormProps {
  initialData?: Partial<Listing>;
  onSubmit: (data: ListingInsert) => Promise<{ error?: string }>;
}

export default function ListingForm({ initialData, onSubmit }: ListingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ListingInsert>({
    title: initialData?.title ?? "",
    description: initialData?.description ?? "",
    price: initialData?.price ?? null,
    category: initialData?.category ?? "",
    status: initialData?.status ?? "draft",
    images: initialData?.images ?? [],
    meta: initialData?.meta ?? {},
  });

  const set = (field: keyof ListingInsert, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await onSubmit(form);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push("/listings");
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
        <input
          required
          type="text"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          rows={4}
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.price ?? ""}
            onChange={(e) => set("price", e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <input
            type="text"
            value={form.category ?? ""}
            onChange={(e) => set("category", e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <select
          value={form.status}
          onChange={(e) => set("status", e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Listing"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="border border-gray-300 text-gray-700 px-5 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
