import Header from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const apiBase =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const rows = [
    { label: "Signed in as", value: user?.email ?? "—" },
    { label: "Supabase project", value: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "—" },
    { label: "API base URL", value: apiBase },
    { label: "Listings endpoint", value: `${apiBase}/api/listings` },
    { label: "Blog endpoint", value: `${apiBase}/api/blog` },
  ];

  return (
    <>
      <Header title="Settings" />
      <main className="p-4 sm:p-8 space-y-6 max-w-2xl">
        {/* Account */}
        <section className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
          <h2 className="font-serif text-lg text-navy mb-4">Account &amp; API</h2>
          <div className="space-y-3">
            {rows.map(({ label, value }) => (
              <div
                key={label}
                className="flex flex-col sm:flex-row sm:items-center py-2.5 border-b border-gold/10 last:border-b-0 gap-1 sm:gap-4"
              >
                <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute w-40 shrink-0">
                  {label}
                </span>
                <span className="text-sm text-navy font-mono break-all">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Integration guide */}
        <section className="bg-white border border-gold/25 rounded-xl p-5 sm:p-7 shadow-[0_2px_20px_-8px_rgba(14,27,48,0.08)]">
          <h2 className="font-serif text-lg text-navy mb-1">Main Website Integration</h2>
          <p className="text-sm text-ink-mute mb-4">
            The main site at{" "}
            <span className="font-mono text-navy">stevenmoning.vercel.app</span> fetches
            content from these read-only endpoints. No API key required for GET requests.
          </p>
          <div className="space-y-3">
            {[
              {
                method: "GET",
                path: "/api/listings",
                desc: "Published listings (supports ?category=, ?limit=, ?offset=)",
              },
              {
                method: "GET",
                path: "/api/listings/:id",
                desc: "Single listing by UUID",
              },
              {
                method: "GET",
                path: "/api/blog",
                desc: "Published blog posts (supports ?tag=, ?limit=, ?offset=)",
              },
              {
                method: "GET",
                path: "/api/blog/:id",
                desc: "Single post by UUID or slug",
              },
            ].map(({ method, path, desc }) => (
              <div key={path} className="flex items-start gap-3">
                <span className="shrink-0 px-2 py-0.5 bg-gold/10 text-gold-dark text-[10px] font-semibold rounded border border-gold/25 mt-0.5">
                  {method}
                </span>
                <div>
                  <code className="text-sm text-navy font-mono">{path}</code>
                  <p className="text-xs text-ink-mute mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-mute mt-5 pt-4 border-t border-gold/15">
            Write operations (POST, PUT, DELETE) require the{" "}
            <code className="font-mono bg-cream-100 px-1 py-0.5 rounded">x-api-key</code>{" "}
            header. Set <code className="font-mono bg-cream-100 px-1 py-0.5 rounded">ADMIN_API_KEY</code> on
            both this project and the main site in Vercel environment variables.
          </p>
        </section>
      </main>
    </>
  );
}
