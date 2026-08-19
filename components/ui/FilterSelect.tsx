"use client";

// A <select> that applies itself. Waiting for the user to hit "Apply" after
// picking from a dropdown is a needless second step, so changing the value
// submits the enclosing form.
//
// requestSubmit() (rather than submit()) fires a real submit event, which is
// what next/form listens for — so this still gets the client-side navigation
// instead of a full page reload. Without JS the select simply stays put and the
// Apply button does the work, so nothing is lost.

export default function FilterSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={
        className ??
        // Full width on a phone so two dropdowns do not end up 90px each and
        // truncate their labels; natural width from sm up.
        "w-full sm:w-auto bg-white border border-gold/30 text-navy rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition sm:shrink-0"
      }
    >
      {children}
    </select>
  );
}
