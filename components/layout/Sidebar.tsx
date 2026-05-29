"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  List,
  PlusCircle,
  Settings,
  LogOut,
  Menu,
  X,
  BookOpen,
  FilePlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Listings", href: "/listings", icon: List },
  { label: "New Listing", href: "/listings/new", icon: PlusCircle },
  { label: "Blog", href: "/blog", icon: BookOpen },
  { label: "New Post", href: "/blog/new", icon: FilePlus },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  // Close drawer whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll while mobile drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const SidebarContent = (
    <>
      {/* Brand */}
      <div className="px-6 py-6 border-b border-gold/15 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gold to-gold-dark rounded-full flex items-center justify-center shrink-0 shadow-[0_4px_12px_-2px_rgba(212,168,75,0.5)]">
            <span className="font-serif text-navy text-lg font-semibold">M</span>
          </div>
          <div>
            <p className="font-serif text-base leading-tight text-cream">
              Moning <span className="text-gold italic">&amp;</span> Associates
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold/70 mt-1">
              Admin Panel
            </p>
          </div>
        </div>
        {/* Mobile close button (visible only inside drawer) */}
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="md:hidden text-cream/70 hover:text-gold p-1"
        >
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
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
          <p className="text-xs text-gold/60 px-3 mb-2 truncate tracking-wide">
            {email}
          </p>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-cream/70 hover:bg-burgundy/30 hover:text-cream w-full transition-colors"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar (visible < md) */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-navy text-cream border-b border-gold/20 shadow-[0_4px_20px_-8px_rgba(14,27,48,0.4)]">
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="p-2 -ml-2 text-cream hover:text-gold transition-colors"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-gold to-gold-dark rounded-full flex items-center justify-center">
            <span className="font-serif text-navy text-sm font-semibold">M</span>
          </div>
          <span className="font-serif text-base">
            Moning <span className="text-gold italic">&amp;</span> Associates
          </span>
        </div>
        <div className="w-9" /> {/* spacer to balance hamburger */}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 min-h-screen bg-navy text-cream flex-col border-r border-navy-700 shrink-0">
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          onClick={() => setOpen(false)}
          className="absolute inset-0 bg-navy/70 backdrop-blur-sm"
        />
        {/* Panel */}
        <aside
          className={`absolute left-0 top-0 bottom-0 w-72 max-w-[85%] bg-navy text-cream flex flex-col border-r border-gold/20 shadow-2xl transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {SidebarContent}
        </aside>
      </div>
    </>
  );
}
