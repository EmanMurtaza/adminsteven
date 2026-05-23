"use client";

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-cream px-4 py-8 sm:py-12">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          {/* Brand mark */}
          <div className="text-center mb-8 sm:mb-10">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 bg-navy-600 rounded-full mb-4 sm:mb-5 ring-4 ring-gold/20">
              <span className="font-serif text-xl sm:text-2xl text-gold">M</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl text-navy tracking-tight leading-tight">
              Moning <span className="text-gold italic">&amp;</span> Associates
            </h1>
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-ink-mute mt-3">
              Admin Panel
            </p>
          </div>

          {/* Card */}
          <div className="bg-white/70 backdrop-blur border border-gold/30 rounded-2xl p-6 sm:p-8 shadow-[0_8px_40px_-12px_rgba(14,27,48,0.15)]">
            <h2 className="font-serif text-xl sm:text-2xl text-navy mb-1">
              Sign in
            </h2>
            <p className="text-xs sm:text-sm text-ink-mute mb-5 sm:mb-6">
              Welcome back. Please enter your credentials.
            </p>

            {error && (
              <div className="mb-5 bg-burgundy/5 border border-burgundy/30 text-burgundy text-sm px-4 py-3 rounded-lg break-words">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] sm:text-xs font-medium uppercase tracking-wider text-ink-soft mb-2">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-cream-100 border border-gold/40 text-navy rounded-lg px-3.5 py-3 text-base sm:text-sm placeholder-ink-mute/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition"
                  placeholder="admin@example.com"
                />
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-medium uppercase tracking-wider text-ink-soft mb-2">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-cream-100 border border-gold/40 text-navy rounded-lg px-3.5 py-3 text-base sm:text-sm placeholder-ink-mute/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-navy hover:bg-navy-500 disabled:opacity-60 text-cream font-medium py-3 px-4 rounded-lg text-sm tracking-wide transition-colors flex items-center justify-center gap-2 mt-4 group"
              >
                {loading && <Loader2 size={16} className="animate-spin text-gold" />}
                <span>{loading ? "Signing in…" : "Sign in"}</span>
                {!loading && (
                  <span className="text-gold group-hover:translate-x-0.5 transition-transform">
                    →
                  </span>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-[11px] sm:text-xs text-ink-mute mt-6 sm:mt-8 tracking-wide px-2">
            Moning &amp; Associates · DFW Real Estate · Est. 2006
          </p>
        </div>
      </div>

      {/* Powered by Autom8x Systems */}
      <footer className="pt-8 sm:pt-10">
        <a
          href="https://autom8xsystems.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="group block text-center"
        >
          <p className="text-[10px] uppercase tracking-[0.25em] text-ink-mute/70 mb-1">
            Powered by
          </p>
          <p className="font-serif text-base sm:text-lg text-navy/80 group-hover:text-gold-dark transition-colors">
            Autom8x <span className="text-gold italic">Systems</span>
            <span className="ml-1.5 text-gold opacity-0 group-hover:opacity-100 transition-opacity">
              ↗
            </span>
          </p>
        </a>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
