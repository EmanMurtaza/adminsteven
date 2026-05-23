"use client";

import Link from "next/link";
import { Listing } from "@/lib/types";
import { Pencil, Trash2, Eye } from "lucide-react";

interface ListingsTableProps {
  listings: Listing[];
  onDelete?: (id: string) => void;
}

const statusColors: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-yellow-100 text-yellow-700",
  archived: "bg-gray-100 text-gray-600",
};

export default function ListingsTable({ listings, onDelete }: ListingsTableProps) {
  if (listings.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        No listings yet.{" "}
        <Link href="/listings/new" className="text-indigo-600 hover:underline">
          Create one
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
          <tr>
            <th className="px-4 py-3 text-left">Title</th>
            <th className="px-4 py-3 text-left">Category</th>
            <th className="px-4 py-3 text-left">Price</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Created</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {listings.map((listing) => (
            <tr key={listing.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{listing.title}</td>
              <td className="px-4 py-3 text-gray-500">{listing.category ?? "—"}</td>
              <td className="px-4 py-3 text-gray-500">
                {listing.price != null ? `$${listing.price.toLocaleString()}` : "—"}
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[listing.status]}`}>
                  {listing.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-400">
                {new Date(listing.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link href={`/listings/${listing.id}`} className="p-1 text-gray-400 hover:text-indigo-600">
                    <Eye size={16} />
                  </Link>
                  <Link href={`/listings/${listing.id}/edit`} className="p-1 text-gray-400 hover:text-indigo-600">
                    <Pencil size={16} />
                  </Link>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(listing.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
