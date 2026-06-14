"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, clearToken, getCurrentUser, getToken } from "../../lib/auth";

type DashboardStats = {
  total_projects: number;
  pending_projects: number;
  processing_projects: number;
  completed_projects: number;
  failed_projects: number;
  total_clips: number;
  total_zips: number;
  total_duration_seconds: number;
};

type UserData = {
  email: string;
  full_name?: string | null;
  plan_key: string;
  is_email_verified: boolean;
};

type BillingOverview = {
  current_plan: {
    key: string;
    name: string;
    processing_hours: number;
    export_quality: string;
  };
  usage: {
    used_hhmmss: string;
    limit_hhmmss: string;
    remaining_hhmmss: string;
  };
};

const defaultStats: DashboardStats = {
  total_projects: 0,
  pending_projects: 0,
  processing_projects: 0,
  completed_projects: 0,
  failed_projects: 0,
  total_clips: 0,
  total_zips: 0,
  total_duration_seconds: 0,
};

function formatDuration(totalSeconds: number | null | undefined): string {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function planTone(plan: string | null | undefined): string {
  if (plan === "creator") return "bg-[#22C55E]/10 text-[#15803D] ring-[#22C55E]/20";
  if (plan === "starter") return "bg-[#06B6D4]/10 text-[#0E7490] ring-[#06B6D4]/20";
  return "bg-[#F59E0B]/10 text-[#B45309] ring-[#F59E0B]/20";
}

function StatCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: string;
}) {
  return (
    <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF4FF] text-xl">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<UserData | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);

  async function loadBilling() {
    try {
      const res = await apiFetch("/billing/overview", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setBilling(data.data);
      }
    } catch {
      // Billing card should not block dashboard.
    }
  }

  async function loadStats() {
    try {
      setError("");
      const res = await apiFetch("/projects/stats/summary", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError("Dashboard stats load nahi hue.");
        return;
      }
      setStats(data.data || defaultStats);
    } catch {
      setError("Backend connect nahi ho raha. Dashboard stats load nahi hue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    getCurrentUser()
      .then(setUser)
      .catch(() => {
        clearToken();
        router.push("/login");
      });

    loadStats();
    loadBilling();
    const interval = setInterval(() => {
      loadStats();
      loadBilling();
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const cards = [
    { label: "Projects", value: stats.total_projects, helper: "Total created", icon: "🎬" },
    { label: "Completed", value: stats.completed_projects, helper: "Ready downloads", icon: "✅" },
    { label: "Processing", value: stats.processing_projects + stats.pending_projects, helper: "Pending + running", icon: "⚡" },
    { label: "Failed", value: stats.failed_projects, helper: "Need retry/check", icon: "⚠️" },
    { label: "Generated Clips", value: stats.total_clips, helper: "Total MP4 clips", icon: "📦" },
    { label: "ZIP Files", value: stats.total_zips, helper: "Download packages", icon: "🗂️" },
    { label: "Total Duration", value: formatDuration(stats.total_duration_seconds), helper: "hh:mm:ss", icon: "⏱️" },
  ];

  return (
    <main className="min-h-screen bg-[#EEF4FF]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] p-5 text-white shadow-xl sm:p-7 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20">
                ClipForge Control Center
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
                YouTube clips, bulk branding, downloads aur usage ko ek jagah se manage karo.
              </p>
              {user && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold ring-1 ring-white/20">
                    {user.email}
                  </span>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-black capitalize ring-1 ${planTone(user.plan_key)}`}>
                    {user.plan_key} plan
                  </span>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <Link
                href="/dashboard/create"
                className="rounded-2xl bg-white px-4 py-4 text-center text-sm font-black text-[#2563EB] shadow-sm transition hover:bg-blue-50"
              >
                + Create Project
              </Link>
              <Link
                href="/dashboard/bulk-brand"
                className="rounded-2xl bg-white/15 px-4 py-4 text-center text-sm font-black text-white ring-1 ring-white/20 transition hover:bg-white/20"
              >
                Bulk Brand
              </Link>
            </div>
          </div>
        </div>

        {billing && (
          <div className="mt-6 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-500">Current Plan</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="text-2xl font-black text-slate-950">{billing.current_plan.name}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${planTone(billing.current_plan.key)}`}>
                    {billing.current_plan.key}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  Used {billing.usage.used_hhmmss} / {billing.usage.limit_hhmmss} • Remaining {billing.usage.remaining_hhmmss}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/dashboard/pricing" className="rounded-2xl bg-[#2563EB] px-5 py-3 text-center text-sm font-black text-white transition hover:bg-[#0633AD]">
                  Manage Plan
                </Link>
                <Link href="/dashboard/projects" className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-black text-slate-950 transition hover:bg-slate-50">
                  View Projects
                </Link>
              </div>
            </div>
          </div>
        )}

        {user && !user.is_email_verified && (
          <div className="mt-6 rounded-[1.75rem] border border-[#F59E0B]/20 bg-[#F59E0B]/10 p-5 text-[#92400E]">
            <p className="font-black">Email verification pending</p>
            <p className="mt-1 text-sm font-semibold">Premium/billing features ke liye email verify karna zaroori hoga.</p>
            <Link href="/verify-email" className="mt-4 inline-block rounded-2xl bg-[#F59E0B] px-4 py-2.5 text-sm font-black text-white">
              Verify Email
            </Link>
          </div>
        )}

        {error && <div className="mt-6 rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">{error}</div>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.slice(0, 4).map((card) => (
            <StatCard key={card.label} label={card.label} value={loading ? "..." : card.value} helper={card.helper} icon={card.icon} />
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {cards.slice(4).map((card) => (
            <StatCard key={card.label} label={card.label} value={loading ? "..." : card.value} helper={card.helper} icon={card.icon} />
          ))}
        </div>

        <div className="mt-6 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <h2 className="text-xl font-black text-slate-950">Quick Actions</h2>
          <p className="mt-1 text-sm text-slate-500">Most used workflows ko yahan se start karo.</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Link href="/dashboard/create" className="rounded-2xl bg-[#EEF4FF] p-5 transition hover:bg-blue-100">
              <p className="text-2xl">🎬</p>
              <h3 className="mt-3 font-black text-slate-950">Create Project</h3>
              <p className="mt-1 text-sm text-slate-600">YouTube link se reels generate karo.</p>
            </Link>
            <Link href="/dashboard/bulk-brand" className="rounded-2xl bg-[#EEF4FF] p-5 transition hover:bg-blue-100">
              <p className="text-2xl">✨</p>
              <h3 className="mt-3 font-black text-slate-950">Bulk Brand Reels</h3>
              <p className="mt-1 text-sm text-slate-600">Uploaded reels par branding apply karo.</p>
            </Link>
            <Link href="/dashboard/projects" className="rounded-2xl bg-[#EEF4FF] p-5 transition hover:bg-blue-100">
              <p className="text-2xl">📁</p>
              <h3 className="mt-3 font-black text-slate-950">My Projects</h3>
              <p className="mt-1 text-sm text-slate-600">All projects, clips aur downloads dekho.</p>
            </Link>
            <Link href="/dashboard/pricing" className="rounded-2xl bg-[#EEF4FF] p-5 transition hover:bg-blue-100">
              <p className="text-2xl">💳</p>
              <h3 className="mt-3 font-black text-slate-950">Pricing</h3>
              <p className="mt-1 text-sm text-slate-600">Plan upgrade aur billing manage karo.</p>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
