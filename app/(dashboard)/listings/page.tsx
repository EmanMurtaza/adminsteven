import Header from "@/components/layout/Header";
import ListingsTable from "@/components/listings/ListingsTable";
import Pagination from "@/components/ui/Pagination";
import {
  FilterBar,
  FilterTabs,
  SearchField,
  SelectField,
  queryString,
} from "@/components/ui/FilterBar";
import { createAuthedServiceClient } from "@/lib/supabase/server";
import { deleteListing as deleteListingDoc, listListings } from "@/lib/listings";
import {
  ACTIVE_LISTING_STATUSES,
  LISTING_STATUSES,
  PROPERTY_TYPES,
  SALES_CHANNELS,
  ListingStatus,
  SalesChannel,
} from "@/lib/types";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PAGE_SIZE = 10;

const FLAGS = [{ value: "featured", label: "Featured only" }];

// Lifecycle buckets. "Active" is the default because a sold listing is finished
// work — still here, still searchable, just not in the way of what is live.
const VIEWS = [
  { key: "active", label: "Active" },
  { key: "sold", label: "Sold" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

/** The statuses a tab stands for. `undefined` means "do not filter by status". */
function statusesForView(view: ViewKey): ListingStatus[] | undefined {
  if (view === "active") return ACTIVE_LISTING_STATUSES;
  if (view === "sold") return ["sold"];
  if (view === "archived") return ["archived"];
  return undefined;
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Auth still gated by Supabase; the listings themselves now live in MongoDB.
  const supabase = await createAuthedServiceClient();
  if (!supabase) redirect("/login");

  const params = await searchParams;
  const q = str(params.q)?.trim();
  const rawView = str(params.view);
  const view: ViewKey = VIEWS.some((v) => v.key === rawView) ? (rawView as ViewKey) : "active";
  // Only accept values we actually offer — a hand-edited URL should not reach
  // the query layer as an unknown status.
  const status = LISTING_STATUSES.some((s) => s.value === str(params.status))
    ? (str(params.status) as ListingStatus)
    : undefined;
  const type = PROPERTY_TYPES.some((t) => t.value === str(params.type))
    ? str(params.type)
    : undefined;
  const channel = SALES_CHANNELS.some((c) => c.value === str(params.channel))
    ? (str(params.channel) as SalesChannel)
    : undefined;
  const flag = FLAGS.some((f) => f.value === str(params.flag))
    ? str(params.flag)
    : undefined;
  const page = Math.max(1, Number(str(params.page) ?? "1") || 1);

  const isFiltered = Boolean(q || status || type || channel || flag);

  let listings;
  let count = 0;
  try {
    const res = await listListings({
      search: q || null,
      // An exact status from the dropdown beats the tab's bucket — the more
      // specific ask wins. listListings applies the same precedence.
      status,
      statuses: statusesForView(view),
      propertyType: type ?? null,
      salesChannel: channel ?? null,
      featured: flag === "featured",
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    });
    listings = res.data;
    count = res.count;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return (
      <p className="p-4 sm:p-8 text-burgundy">
        Failed to load listings: {message}
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  async function deleteListing(id: string) {
    "use server";
    const supabase = await createAuthedServiceClient();
    if (!supabase) return { error: "Not signed in — please log in again." };
    const deleted = await deleteListingDoc(id);
    revalidatePath("/listings");
    revalidatePath("/dashboard");
    return deleted ? {} : { error: "Listing not found" };
  }

  // Every active filter rides along on the page links, so paging does not
  // silently drop back to the unfiltered list. `view` is a place in the app
  // rather than a filter, so it is carried separately and survives Clear.
  const carried = { q, status, type, channel, flag };
  const viewParam = view === "active" ? undefined : view;
  const qs = (over: Record<string, string | undefined>) =>
    queryString("/listings", { view: viewParam, ...carried, ...over });

  return (
    <>
      <Header title="Listings" />
      <main className="p-4 sm:p-8 space-y-5">
        <FilterTabs
          tabs={VIEWS}
          active={view}
          href={(key) => qs({ view: key === "active" ? undefined : key, status: undefined })}
        />

        <div className="flex justify-between items-start gap-3 flex-wrap">
          <FilterBar
            action="/listings"
            isFiltered={isFiltered}
            hidden={{ view: viewParam }}
          >
            <SearchField
              defaultValue={q}
              placeholder="Search title, address, city, MLS #…"
            />
            <SelectField
              name="status"
              value={status}
              anyLabel="Any status"
              options={LISTING_STATUSES}
            />
            <SelectField
              name="type"
              value={type}
              anyLabel="Any type"
              options={PROPERTY_TYPES}
            />
            <SelectField
              name="channel"
              value={channel}
              anyLabel="Any sub-type"
              options={SALES_CHANNELS}
            />
            <SelectField
              name="flag"
              value={flag}
              anyLabel="All listings"
              options={FLAGS}
            />
          </FilterBar>

          <Link
            href="/listings/new"
            className="bg-navy hover:bg-navy-500 text-cream px-4 sm:px-5 py-2.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 shrink-0"
          >
            <span>+ New Listing</span>
            <span className="text-gold">›</span>
          </Link>
        </div>

        <p className="text-sm text-ink-mute">
          <span className="font-serif text-navy text-base">{count}</span>{" "}
          {count === 1 ? "listing" : "listings"}
          {isFiltered && " matching your filters"}
          {q && (
            <>
              {" "}
              · search <span className="text-navy font-medium">“{q}”</span>
            </>
          )}
          {totalPages > 1 && (
            <span className="text-ink-mute/70">
              {" "}
              · page {page} of {totalPages}
            </span>
          )}
        </p>

        {count === 0 && isFiltered ? (
          <div className="bg-white border border-gold/30 rounded-xl p-8 text-center">
            <p className="text-ink-soft mb-3">No listings match these filters.</p>
            <Link
              href={queryString("/listings", { view: viewParam })}
              className="text-navy underline underline-offset-4 hover:text-gold text-sm"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <ListingsTable listings={listings ?? []} onDelete={deleteListing} />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/listings"
          extraParams={{ view: viewParam, ...carried }}
        />
      </main>
    </>
  );
}
