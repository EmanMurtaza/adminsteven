"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, List, PlusCircle, Settings, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Listings", href: "/listings", icon: List },
  { label: "New Listing", href: "/listings/new", icon: PlusCircle },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 min-h-screen bg-navy text-cream flex flex-col border-r border-navy-700">
      {/* Brand */}
      <div className="px-6 py-6 border-b border-gold/15">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gold to-gold-dark rounded-full flex items-center justify-center shrink-0 shadow-[0_4px_12px_-2px_rgba(212,168,75,0.5)]">
            <span className="font-serif text-navy text-lg font-semibold">M</span>
          </div>
          <div>
            <p className="font-serif text-base leading-tight text-cream">
              Moning <span className="text-gold italic">&amp;</span> Associates
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold/70 mt-1">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                active
                  ? "bg-gold/10 text-gold border-l-2 border-gold pl-[10px]"
                  : "text-cream/70 hover:bg-navy-500/50 hover:text-cream"
              }`}
            >
              <Icon size={17} className={active ? "text-gold" : "text-cream/60"} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="px-3 py-4 border-t border-gold/15">
        {email && (
          <p className="text-xs text-gold/60 px-3 mb-2 truncate tracking-wide">{email}</p>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-cream/70 hover:bg-burgundy/30 hover:text-cream w-full transition-colors"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
