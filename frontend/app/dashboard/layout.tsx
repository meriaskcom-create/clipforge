"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { clearToken, getCurrentUser, getToken } from "../../lib/auth";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  helper: string;
};

type CurrentUser = {
  email: string;
  full_name?: string | null;
  plan_key?: string | null;
  is_admin?: boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠", helper: "Overview" },
  { href: "/dashboard/create", label: "Create", icon: "🎬", helper: "YouTube to reels" },
  { href: "/dashboard/projects", label: "Projects", icon: "📁", helper: "Library" },
  { href: "/dashboard/bulk-brand", label: "Bulk Brand", icon: "✨", helper: "Upload reels" },
  { href: "/dashboard/pricing", label: "Pricing", icon: "💳", helper: "Plans" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getDisplayName(user: CurrentUser | null): string {
  if (user?.full_name?.trim()) return user.full_name.trim();
  if (user?.email) return user.email.split("@")[0];
  return "User";
}

function getInitials(user: CurrentUser | null): string {
  const name = getDisplayName(user);
  const parts = name
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "CF";
}

function getPlanLabel(user: CurrentUser | null): string {
  const rawPlan = user?.plan_key || "free";
  const normalized = rawPlan.replace(/[_-]/g, " ").trim();
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} Plan`;
}

function SidebarProfileCard({ user }: { user: CurrentUser | null }) {
  const displayName = getDisplayName(user);
  const initials = getInitials(user);
  const planLabel = getPlanLabel(user);

  return (
    <div className="border-t border-white/10 pt-4">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-white transition hover:bg-white/10"
        title={user?.email || displayName}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F59E0B] text-xs font-black text-white shadow-sm ring-1 ring-white/15">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black leading-5 text-white">
            {displayName}
          </span>
          <span className="block truncate text-xs font-semibold leading-5 text-blue-100">
            {planLabel}
          </span>
        </span>
      </button>
    </div>
  );
}

function SidebarContent({ onNavigate, isAdmin, user }: { onNavigate?: () => void; isAdmin: boolean; user: CurrentUser | null }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearToken();
    onNavigate?.();
    router.push("/login");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-6">
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-[#2563EB] shadow-sm">
            CF
          </div>
          <div>
            <p className="text-lg font-black tracking-tight text-white">ClipForge</p>
            <p className="text-xs font-semibold text-blue-100">AI Video Clipping</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-2 px-4">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
                active
                  ? "bg-white text-[#0633AD] shadow-sm"
                  : "text-blue-50 hover:bg-white/12 hover:text-white"
              }`}
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${
                active ? "bg-[#EEF4FF]" : "bg-white/10 group-hover:bg-white/15"
              }`}>
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black">{item.label}</span>
                <span className={`block text-xs font-semibold ${active ? "text-slate-500" : "text-blue-100"}`}>
                  {item.helper}
                </span>
              </span>
            </Link>
          );
        })}

        {isAdmin && (
          <Link
            href="/admin"
            onClick={onNavigate}
            className={`group flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
              isActive(pathname, "/admin")
                ? "bg-white text-[#0633AD] shadow-sm"
                : "text-blue-50 hover:bg-white/12 hover:text-white"
            }`}
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${
              isActive(pathname, "/admin") ? "bg-[#EEF4FF]" : "bg-white/10 group-hover:bg-white/15"
            }`}>
              🛠️
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black">Admin</span>
              <span className={`block text-xs font-semibold ${isActive(pathname, "/admin") ? "text-slate-500" : "text-blue-100"}`}>
                Operations
              </span>
            </span>
          </Link>
        )}

      </nav>

      <div className="space-y-3 px-4 pb-5">
        <SidebarProfileCard user={user} />

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#0633AD] shadow-sm transition hover:bg-blue-50"
        >
          <span>↪</span>
          Logout
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
        setIsAdmin(Boolean(currentUser?.is_admin));
      })
      .catch(() => {
        setUser(null);
        setIsAdmin(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#EEF4FF]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 bg-gradient-to-b from-[#2563EB] via-[#2563EB] to-[#0633AD] shadow-2xl lg:block">
        <SidebarContent isAdmin={isAdmin} user={user} />
      </aside>

      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-2xl bg-[#2563EB] px-4 py-2 text-sm font-black text-white shadow-sm"
          >
            Menu
          </button>
          <Link href="/dashboard" className="text-lg font-black text-slate-950">
            ClipForge
          </Link>
          <Link href="/dashboard/create" className="rounded-2xl bg-[#EEF4FF] px-4 py-2 text-sm font-black text-[#2563EB]">
            Create
          </Link>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[86vw] max-w-sm bg-gradient-to-b from-[#2563EB] via-[#2563EB] to-[#0633AD] shadow-2xl">
            <div className="absolute right-4 top-4">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl bg-white/15 px-3 py-2 text-sm font-black text-white ring-1 ring-white/20"
              >
                ✕
              </button>
            </div>
            <SidebarContent isAdmin={isAdmin} user={user} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-72">
        {children}
      </div>
    </div>
  );
}
