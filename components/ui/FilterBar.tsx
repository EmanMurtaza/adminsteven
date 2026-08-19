import Form from "next/form";
import Link from "next/link";
import { Search, X } from "lucide-react";
import FilterSelect from "./FilterSelect";

// Shared filter bar for every list section.
//
// Everything is URL-driven: filters are plain GET fields, so a filtered view is
// shareable, survives a refresh, and works with the browser's back button.
// `next/form` keeps that behaviour but upgrades the submit to a client-side
// navigation (and prefetches the route), so applying a filter does not reload
// the shell.
//
// Note the bar deliberately carries no `page` field — submitting it drops
// ?page= from the URL, which is what you want: changing a filter should put you
// back on page 1 rather than page 7 of a different result set.

const controlClass =
  "bg-white border border-gold/30 text-navy rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition";

export { controlClass };

export function FilterBar({
  action,
  hidden,
  isFiltered,
  children,
}: {
  /** Route the filters submit to, e.g. "/listings". */
  action: string;
  /** Params to carry through that are not inputs here (e.g. the active tab). */
  hidden?: Record<string, string | undefined>;
  /** Whether any filter is currently applied — controls the Clear link. */
  isFiltered: boolean;
  children: React.ReactNode;
}) {
  return (
    <Form action={action} className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden ?? {}).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null
      )}

      {children}

      {/* Selects auto-submit, so this is mainly the no-JS path and the way to
          commit what you typed in the search box. */}
      <button
        type="submit"
        className="flex-1 sm:flex-none border border-navy/30 text-navy hover:bg-navy hover:text-cream px-5 py-2.5 rounded-md text-sm font-medium transition-colors shrink-0"
      >
        Apply
      </button>

      {/* Clear drops the filters but keeps the hidden params — those carry the
          active tab, which is a place in the app rather than a filter. */}
      {isFiltered && (
        <Link
          href={queryString(action, hidden ?? {})}
          className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-md text-sm text-ink-mute hover:text-navy hover:bg-cream-200 transition-colors shrink-0"
          title="Clear all filters"
        >
          <X size={15} />
          Clear
        </Link>
      )}
    </Form>
  );
}

export function SearchField({
  defaultValue,
  placeholder,
  name = "q",
}: {
  defaultValue?: string;
  placeholder: string;
  name?: string;
}) {
  return (
    <div className="relative flex-1 basis-full sm:basis-auto min-w-0 sm:min-w-56 max-w-full sm:max-w-md">
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none"
      />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={`${controlClass} w-full pl-9 bg-cream-100 placeholder-ink-mute/60`}
      />
    </div>
  );
}

/**
 * A compact free-text filter, for values that come from the data rather than a
 * fixed list — a tag, say, where the options are whatever the last import
 * happened to contain and enumerating them would mean reading every row.
 */
export function TextField({
  name,
  value,
  placeholder,
}: {
  name: string;
  value: string | undefined;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      name={name}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`${controlClass} w-full sm:w-40 placeholder-ink-mute/60`}
    />
  );
}

/** A labelled dropdown whose first entry means "no filter". */
export function SelectField({
  name,
  value,
  anyLabel,
  options,
}: {
  name: string;
  value: string | undefined;
  /** Text for the empty option, e.g. "Any status". */
  anyLabel: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <FilterSelect name={name} defaultValue={value ?? ""} aria-label={anyLabel}>
      <option value="">{anyLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </FilterSelect>
  );
}

/** Link-style tabs for the one filter that deserves to be always visible. */
export function FilterTabs<T extends string>({
  tabs,
  active,
  href,
}: {
  tabs: readonly { key: T; label: string }[];
  active: T;
  /** Builds the URL for a tab — callers drop `page` here. */
  href: (key: T) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={href(t.key)}
          aria-current={t.key === active ? "page" : undefined}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
            t.key === active
              ? "bg-navy text-cream border-navy"
              : "bg-white text-ink-soft border-gold/30 hover:border-gold hover:text-navy"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Builds a query-string helper for a section. Falsy values are dropped, so the
 * unfiltered view stays on the bare URL rather than accumulating `?x=&y=`.
 */
export function queryString(
  basePath: string,
  params: Record<string, string | undefined>
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) sp.set(key, value);
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
