"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, clearToken, getCurrentUser, getToken } from "../../../../lib/auth";

function statusTone(status: string) {
  if (status === "active" || status === "completed") return "bg-[#22C55E]/10 text-[#15803D] ring-[#22C55E]/20";
  if (status === "failed") return "bg-[#EF4444]/10 text-[#B91C1C] ring-[#EF4444]/20";
  if (status === "processing" || status === "pending") return "bg-[#2563EB]/10 text-[#1D4ED8] ring-[#2563EB]/20";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}


function getAdminErrorMessage(data: any, fallback: string) {
  const detail = data?.detail ?? data?.message ?? data;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.msg) {
          const loc = Array.isArray(item.loc) ? item.loc.join(".") : item.loc;
          return loc ? `${loc}: ${item.msg}` : item.msg;
        }
        return JSON.stringify(item);
      })
      .join(" | ");
  }
  if (typeof detail === "object") {
    if (detail.msg) return String(detail.msg);
    if (detail.message) return String(detail.message);
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  return String(detail);
}


export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const [data, setData] = useState<any | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadUser() {
    setError("");
    try {
      const res = await apiFetch(`/admin/users/${userId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(getAdminErrorMessage(json, "User load failed"));
        return;
      }
      setData(json.data);
    } catch {
      setError("Backend connect nahi ho raha ya admin access missing hai.");
    }
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }

    getCurrentUser()
      .then((user) => {
        if (!user?.is_admin) {
          window.location.href = "/dashboard";
          return;
        }
        loadUser();
      })
      .catch(() => {
        clearToken();
        window.location.href = "/login";
      });
  }, [userId]);

  async function changePlan(planKey: string) {
    setMessage("");
    setError("");
    try {
      const res = await apiFetch(`/admin/users/${userId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: planKey }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(getAdminErrorMessage(json, "Plan update failed"));
        return;
      }
      setMessage(json.message || "Plan updated");
      await loadUser();
    } catch {
      setError("Plan update nahi hua.");
    }
  }

  async function adjustHours() {
    const raw = window.prompt("Kitne hours add karne hain? Example: 10. Remove ke liye -5");
    if (!raw) return;
    const hours = Number(raw);
    if (!Number.isFinite(hours)) {
      setError("Valid hours enter karo.");
      return;
    }

    setMessage("");
    setError("");
    try {
      const res = await apiFetch(`/admin/users/${userId}/hours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours, note: "Admin user detail adjustment" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(getAdminErrorMessage(json, "Hours update failed"));
        return;
      }
      setMessage(json.message || "Hours adjusted");
      await loadUser();
    } catch {
      setError("Hours update nahi hua.");
    }
  }

  async function markEmailVerified(isVerified: boolean) {
    setMessage("");
    setError("");
    try {
      const res = await apiFetch(`/admin/users/${userId}/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_email_verified: isVerified }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(getAdminErrorMessage(json, "Email update failed"));
        return;
      }
      setMessage(json.message || "Email verification updated");
      await loadUser();
    } catch {
      setError("Email verify update nahi hua.");
    }
  }

  const user = data?.user;

  return (
    <main className="min-h-screen bg-[#EEF4FF] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <Link href="/admin" className="text-sm font-black text-slate-600 hover:text-slate-950">← Back to Admin</Link>

        <div className="mt-5 rounded-[2rem] bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] p-6 text-white shadow-xl">
          <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20">Admin User Detail</p>
          <h1 className="mt-4 break-all text-3xl font-black sm:text-5xl">{user?.email || "Loading user..."}</h1>
          <p className="mt-3 text-sm text-blue-50">User profile, plan, processing hours, projects aur subscriptions manage karo.</p>
        </div>

        {error && <div className="mt-6 rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">{error}</div>}
        {message && <div className="mt-6 rounded-2xl bg-[#22C55E]/10 p-4 text-sm font-bold text-[#15803D]">{message}</div>}

        {!user && !error && <div className="mt-6 rounded-3xl bg-white p-8 text-slate-500 shadow-sm ring-1 ring-slate-200">Loading...</div>}

        {user && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm font-bold text-slate-500">Current Plan</p>
                <p className="mt-2 text-2xl font-black capitalize">{user.plan_key}</p>
                <p className="mt-1 text-xs text-slate-500">{user.plan_name}</p>
              </div>
              <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm font-bold text-slate-500">Usage</p>
                <p className="mt-2 text-2xl font-black">{user.used_hhmmss}</p>
                <p className="mt-1 text-xs text-slate-500">Limit {user.limit_hhmmss}</p>
              </div>
              <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm font-bold text-slate-500">Projects</p>
                <p className="mt-2 text-2xl font-black">{user.projects}</p>
                <p className="mt-1 text-xs text-slate-500">{user.completed_projects} completed</p>
              </div>
              <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm font-bold text-slate-500">Email Status</p>
                <p className="mt-2 text-2xl font-black">{user.is_email_verified ? "Verified" : "Pending"}</p>
                <p className="mt-1 text-xs text-slate-500">Joined {formatDate(user.created_at)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[380px_1fr]">
              <div className="space-y-5">
                <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-xl font-black">Quick Controls</h2>
                  <div className="mt-5 grid gap-3">
                    {["free", "starter", "creator"].map((plan) => (
                      <button key={plan} onClick={() => changePlan(plan)} className="rounded-2xl bg-[#EEF4FF] px-4 py-3 text-sm font-black capitalize text-[#2563EB]">
                        Change to {plan}
                      </button>
                    ))}
                    <button onClick={adjustHours} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
                      Add / Remove Hours
                    </button>
                    <button onClick={() => markEmailVerified(true)} className="rounded-2xl bg-[#22C55E] px-4 py-3 text-sm font-black text-white">
                      Mark Email Verified
                    </button>
                    <button onClick={() => markEmailVerified(false)} className="rounded-2xl bg-[#F59E0B] px-4 py-3 text-sm font-black text-white">
                      Mark Email Pending
                    </button>
                  </div>
                </div>

                <div className="rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-sm">
                  <h2 className="text-xl font-black">Account Info</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    <p><span className="text-slate-400">Name:</span> {user.full_name || "-"}</p>
                    <p className="break-all"><span className="text-slate-400">User ID:</span> {user.id}</p>
                    <p><span className="text-slate-400">Subscription:</span> {user.subscription_status}</p>
                    <p><span className="text-slate-400">Gateway:</span> {user.subscription_gateway}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-xl font-black">Recent Projects</h2>
                  <div className="mt-5 space-y-3">
                    {(data.projects || []).map((project: any) => (
                      <div key={project.id} className="rounded-2xl bg-[#EEF4FF] p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-black">{project.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatDate(project.created_at)} • {project.output_format}</p>
                          </div>
                          <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ring-1 ${statusTone(project.status)}`}>{project.status}</span>
                        </div>
                      </div>
                    ))}
                    {(data.projects || []).length === 0 && <p className="text-sm text-slate-500">No projects.</p>}
                  </div>
                </div>

                <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-xl font-black">Subscriptions / Payments</h2>
                  <div className="mt-5 space-y-3">
                    {(data.subscriptions || []).map((sub: any) => (
                      <div key={sub.id} className="rounded-2xl bg-[#EEF4FF] p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-black capitalize">{sub.plan_key} • {sub.gateway}</p>
                            <p className="mt-1 break-all text-xs text-slate-500">{sub.gateway_reference || "No reference"}</p>
                          </div>
                          <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ring-1 ${statusTone(sub.status)}`}>{sub.status}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{formatDate(sub.created_at)}</p>
                      </div>
                    ))}
                    {(data.subscriptions || []).length === 0 && <p className="text-sm text-slate-500">No subscriptions.</p>}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
