import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Route the pager links to, e.g. "/listings". */
  basePath: string;
  /** Query params to preserve on every page link (e.g. { filter: "buyer" }). */
  extraParams?: Record<string, string | undefined>;
}

function buildHref(
  basePath: string,
  page: number,
  extraParams?: Record<string, string | undefined>
): string {
  const sp = new URLSearchParams();
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) sp.set(key, value);
    }
  }
  // Page 1 is the canonical bare URL — omit ?page=1.
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// First page, last page, and a window around the current page, with "…" gaps.
function pageItems(current: number, total: number): (number | "ellipsis")[] {
  const items: (number | "ellipsis")[] = [];
  const window = 1;
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= current - window && p <= current + window)) {
      items.push(p);
    } else if (items[items.length - 1] !== "ellipsis") {
      items.push("ellipsis");
    }
  }
  return items;
}

const numberBase =
  "min-w-9 h-9 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium border transition-colors";

export default function Pagination({
  currentPage,
  totalPages,
  basePath,
  extraParams,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = pageItems(currentPage, totalPages);
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      className="flex items-center justify-center gap-1.5 pt-2"
      aria-label="Pagination"
    >
      {prevDisabled ? (
        <span className={`${numberBase} border-gold/20 text-ink-mute/40 cursor-default`}>
          ‹ Prev
        </span>
      ) : (
        <Link
          href={buildHref(basePath, currentPage - 1, extraParams)}
          className={`${numberBase} bg-white border-gold/30 text-ink-soft hover:border-gold hover:text-navy`}
        >
          ‹ Prev
        </Link>
      )}

      {items.map((item, i) =>
        item === "ellipsis" ? (
          <span
            key={`e${i}`}
            className="min-w-9 h-9 inline-flex items-center justify-center text-ink-mute text-sm"
          >
            …
          </span>
        ) : item === currentPage ? (
          <span
            key={item}
            aria-current="page"
            className={`${numberBase} bg-navy border-navy text-cream`}
          >
            {item}
          </span>
        ) : (
          <Link
            key={item}
            href={buildHref(basePath, item, extraParams)}
            className={`${numberBase} bg-white border-gold/30 text-ink-soft hover:border-gold hover:text-navy`}
          >
            {item}
          </Link>
        )
      )}

      {nextDisabled ? (
        <span className={`${numberBase} border-gold/20 text-ink-mute/40 cursor-default`}>
          Next ›
        </span>
      ) : (
        <Link
          href={buildHref(basePath, currentPage + 1, extraParams)}
          className={`${numberBase} bg-white border-gold/30 text-ink-soft hover:border-gold hover:text-navy`}
        >
          Next ›
        </Link>
      )}
    </nav>
  );
}
