"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, clearToken, getCurrentUser, getToken } from "../../lib/auth";

type AnyRow = Record<string, any>;

function formatMoney(value: number | string | null | undefined) {
  const numberValue = Number(value || 0);
  return `₹${numberValue.toLocaleString("en-IN")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

function statusTone(status?: string) {
  const safe = String(status || "").toLowerCase();
  if (["active", "completed", "success", "verified"].includes(safe)) return "bg-[#22C55E]/10 text-[#15803D] ring-[#22C55E]/20";
  if (["failed", "cancelled", "error"].includes(safe)) return "bg-[#EF4444]/10 text-[#B91C1C] ring-[#EF4444]/20";
  if (["pending", "processing", "posting"].includes(safe)) return "bg-[#F59E0B]/10 text-[#B45309] ring-[#F59E0B]/20";
  return "bg-[#2563EB]/10 text-[#1D4ED8] ring-[#2563EB]/20";
}

function errorMessage(data: any, fallback: string) {
  const detail = data?.detail ?? data?.message ?? data;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((i) => i?.msg || JSON.stringify(i)).join(" | ");
  try { return JSON.stringify(detail); } catch { return fallback; }
}

export default function AdminPanelPage() {
  const [dashboard, setDashboard] = useState<AnyRow | null>(null);
  const [users, setUsers] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);
  const [queue, setQueue] = useState<AnyRow | null>(null);
  const [plans, setPlans] = useState<AnyRow[]>([]);
  const [projects, setProjects] = useState<AnyRow[]>([]);
  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [projectStatus, setProjectStatus] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function readJson(res: Response) {
    return res.json().catch(() => null);
  }

  async function loadAdmin() {
    setError("");
    try {
      const [dashRes, usersRes, paymentsRes, queueRes, plansRes, projectsRes] = await Promise.all([
        apiFetch("/admin/dashboard", { cache: "no-store" }),
        apiFetch("/admin/users", { cache: "no-store" }),
        apiFetch("/admin/payments", { cache: "no-store" }),
        apiFetch("/admin/queue", { cache: "no-store" }),
        apiFetch("/admin/plans", { cache: "no-store" }),
        apiFetch("/admin/projects", { cache: "no-store" }),
      ]);

      const dashData = await readJson(dashRes);
      if (!dashRes.ok || !dashData?.success) {
        setError(errorMessage(dashData, "Admin access required. Backend .env me ADMIN_EMAILS add karo."));
        return;
      }

      setDashboard(dashData.data);
      setUsers((await readJson(usersRes))?.data || []);
      setPayments((await readJson(paymentsRes))?.data || []);
      setQueue((await readJson(queueRes))?.data || null);
      setPlans((await readJson(plansRes))?.data || dashData?.data?.plans || []);
      setProjects((await readJson(projectsRes))?.data || []);
    } catch {
      setError("Backend connect nahi ho raha ya admin API unavailable hai.");
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
        loadAdmin();
      })
      .catch(() => {
        clearToken();
        window.location.href = "/login";
      });
  }, []);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const matchesSearch = !query || String(user.email || "").toLowerCase().includes(query.toLowerCase());
    const matchesPlan = planFilter === "all" || user.plan_key === planFilter;
    return matchesSearch && matchesPlan;
  }), [users, query, planFilter]);

  const filteredProjects = useMemo(() => projects.filter((project) => projectStatus === "all" || project.status === projectStatus), [projects, projectStatus]);

  async function postAction(path: string, body?: any, okText?: string) {
    setMessage("");
    setError("");
    try {
      const res = await apiFetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await readJson(res);
      if (!res.ok || !data?.success) {
        setError(errorMessage(data, "Action failed"));
        return;
      }
      setMessage(data.message || okText || "Done");
      await loadAdmin();
    } catch {
      setError("Action complete nahi hua.");
    }
  }

  async function changePlan(userId: string, planKey: string) {
    await postAction(`/admin/users/${userId}/plan`, { plan_key: planKey }, "Plan updated");
  }

  async function adjustHours(userId: string) {
    const raw = window.prompt("Kitne hours add karne hain? Example: 10. Remove ke liye -5");
    if (!raw) return;
    const hours = Number(raw);
    if (!Number.isFinite(hours)) {
      setError("Valid hours enter karo.");
      return;
    }
    await postAction(`/admin/users/${userId}/hours`, { hours, note: "Admin manual adjustment" }, "Hours adjusted");
  }

  async function updatePlan(plan: AnyRow) {
    const priceRaw = window.prompt(`${plan.name} ka new monthly price`, String(plan.price_monthly ?? 0));
    if (priceRaw === null) return;
    const hoursRaw = window.prompt(`${plan.name} ke processing hours`, String(plan.processing_hours ?? 1));
    if (hoursRaw === null) return;
    const price = Number(priceRaw);
    const hours = Number(hoursRaw);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(hours) || hours < 0) {
      setError("Valid price aur hours enter karo.");
      return;
    }
    setMessage("");
    setError("");
    try {
      const res = await apiFetch(`/admin/plans/${plan.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_monthly: Math.round(price), processing_hours: Math.round(hours) }),
      });
      const data = await readJson(res);
      if (!res.ok || !data?.success) {
        setError(errorMessage(data, "Plan update failed"));
        return;
      }
      setMessage(data.message || "Plan updated");
      await loadAdmin();
    } catch {
      setError("Plan update nahi hua.");
    }
  }

  const stats = dashboard?.stats || {};
  const cards = [
    ["Total Users", stats.total_users || 0, "All accounts"],
    ["Verified Users", stats.verified_users || 0, "Email verified"],
    ["Paid Users", stats.paid_users || 0, "Starter + Creator"],
    ["Projects", stats.total_projects || 0, "All projects"],
    ["Processing", stats.processing_projects || 0, "Pending/running"],
    ["Failed", stats.failed_projects || 0, "Need attention"],
    ["Usage", stats.total_processing_hhmmss || "00:00:00", "Completed duration"],
    ["Subscriptions", stats.active_subscriptions || 0, "Active records"],
  ];

  return (
    <main className="min-h-screen bg-[#EEF4FF] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="rounded-[2rem] bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] p-6 text-white shadow-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20">Admin Panel</p>
              <h1 className="mt-4 text-3xl font-black sm:text-5xl">ClipForge Operations</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50">Users, plans, payments, projects aur queue monitoring ek jagah.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={loadAdmin} className="rounded-2xl bg-white/15 px-5 py-3 text-sm font-black text-white ring-1 ring-white/25">Refresh</button>
              <Link href="/dashboard" className="rounded-2xl bg-white px-5 py-3 text-center text-sm font-black text-[#2563EB]">Back Dashboard</Link>
            </div>
          </div>
        </div>

        {error && <div className="mt-6 rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">{error}</div>}
        {message && <div className="mt-6 rounded-2xl bg-[#22C55E]/10 p-4 text-sm font-bold text-[#15803D]">{message}</div>}

        <div className="mt-6 flex flex-wrap gap-3">
          {["dashboard", "users", "projects", "plans", "payments", "queue"].map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`rounded-2xl px-5 py-3 text-sm font-black capitalize ${tab === item ? "bg-[#2563EB] text-white" : "bg-white text-slate-950 ring-1 ring-slate-200"}`}>{item}</button>
          ))}
        </div>

        {tab === "dashboard" && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map(([label, value, helper]) => (
                <div key={label} className="rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm font-bold text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-black">{String(value)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <section className="rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-xl font-black">Plan Distribution</h2>
                <div className="mt-5 space-y-3">
                  {Object.entries(dashboard?.plan_distribution || {}).map(([plan, count]) => (
                    <div key={plan} className="flex items-center justify-between rounded-2xl bg-[#EEF4FF] p-4">
                      <span className="font-black capitalize">{plan}</span>
                      <span className="font-black">{String(count)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-xl font-black">Recent Projects</h2>
                <div className="mt-5 space-y-3">
                  {(dashboard?.recent_projects || []).slice(0, 6).map((project: AnyRow) => (
                    <div key={project.id} className="rounded-2xl bg-[#EEF4FF] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-black">{project.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{project.user?.email || project.user_id} • {formatDate(project.created_at)}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${statusTone(project.status)}`}>{project.status}</span>
                      </div>
                      {project.latest_job?.current_stage && <p className="mt-2 text-xs font-semibold text-slate-500">{project.latest_job.current_stage}</p>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}

        {tab === "users" && (
          <section className="mt-6 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search user email" className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-[#2563EB]/10" />
              <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none">
                <option value="all">All Plans</option>
                {plans.map((plan) => <option key={plan.key} value={plan.key}>{plan.name}</option>)}
              </select>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="text-slate-500"><tr><th className="p-3">User</th><th className="p-3">Plan</th><th className="p-3">Usage</th><th className="p-3">Projects</th><th className="p-3">Verified</th><th className="p-3">Actions</th></tr></thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-t border-slate-100">
                      <td className="p-3"><p className="font-black">{user.email}</p><p className="text-xs text-slate-500">{user.full_name || "No name"}</p></td>
                      <td className="p-3 capitalize">{user.plan_key}</td>
                      <td className="p-3">{user.used_hhmmss} / {user.limit_hhmmss}</td>
                      <td className="p-3">{user.projects}</td>
                      <td className="p-3">{user.is_email_verified ? "Yes" : "No"}</td>
                      <td className="p-3"><div className="flex flex-wrap gap-2">
                        <Link href={`/admin/users/${user.id}`} className="rounded-xl bg-[#2563EB] px-3 py-2 text-xs font-black text-white">View</Link>
                        {plans.map((plan) => <button key={plan.key} onClick={() => changePlan(user.id, plan.key)} className="rounded-xl bg-[#EEF4FF] px-3 py-2 text-xs font-black text-[#2563EB]">{plan.key}</button>)}
                        <button onClick={() => adjustHours(user.id)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Hours</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No users found.</p>}
            </div>
          </section>
        )}

        {tab === "projects" && (
          <section className="mt-6 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-xl font-black">Project Monitor</h2><p className="mt-1 text-sm text-slate-500">Processing, failed aur completed jobs ka status.</p></div>
              <select value={projectStatus} onChange={(e) => setProjectStatus(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none">
                <option value="all">All Status</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="completed">Completed</option><option value="failed">Failed</option>
              </select>
            </div>
            <div className="mt-5 space-y-3">
              {filteredProjects.map((project) => (
                <div key={project.id} className="rounded-2xl bg-[#EEF4FF] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-black">{project.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{project.user?.email || project.user_id} • {formatDate(project.created_at)} • {project.output_format}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">{project.latest_job?.current_stage || "No job stage"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${statusTone(project.status)}`}>{project.status}</span>
                      <button onClick={() => postAction(`/admin/projects/${project.id}/reset`, undefined, "Project reset")} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#2563EB] ring-1 ring-slate-200">Reset</button>
                      <button onClick={() => postAction(`/admin/projects/${project.id}/mark-failed`, undefined, "Project failed")} className="rounded-xl bg-[#EF4444] px-3 py-2 text-xs font-black text-white">Mark Failed</button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredProjects.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No projects found.</p>}
            </div>
          </section>
        )}

        {tab === "plans" && (
          <section className="mt-6 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black">Plan Management</h2>
            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => (
                <div key={plan.key} className="rounded-[2rem] border border-slate-200 bg-[#EEF4FF] p-5">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">{plan.key}</p>
                  <h3 className="mt-2 text-2xl font-black">{plan.name}</h3>
                  <div className="mt-5 grid gap-3"><div className="rounded-2xl bg-white p-4"><p className="text-xs font-bold text-slate-500">Monthly Price</p><p className="mt-1 text-3xl font-black">{formatMoney(plan.price_monthly)}</p></div><div className="rounded-2xl bg-white p-4"><p className="text-xs font-bold text-slate-500">Processing Hours</p><p className="mt-1 text-3xl font-black">{plan.processing_hours}h</p></div></div>
                  <button onClick={() => updatePlan(plan)} className="mt-5 w-full rounded-2xl bg-[#2563EB] px-5 py-4 text-sm font-black text-white">Update Price / Hours</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "payments" && (
          <section className="mt-6 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black">Payments / Subscriptions</h2>
            <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-slate-500"><tr><th className="p-3">User</th><th className="p-3">Plan</th><th className="p-3">Amount</th><th className="p-3">Gateway</th><th className="p-3">Status</th><th className="p-3">Reference</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t border-slate-100"><td className="p-3 font-semibold">{payment.email}</td><td className="p-3">{payment.plan_name}</td><td className="p-3 font-black">{formatMoney(payment.amount)}</td><td className="p-3">{payment.gateway}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${statusTone(payment.status)}`}>{payment.status}</span></td><td className="p-3 text-xs text-slate-500">{payment.gateway_reference || "-"}</td></tr>)}</tbody></table></div>
          </section>
        )}

        {tab === "queue" && (
          <section className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
            <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="text-xl font-black">Queue Status</h2><div className="mt-5 space-y-3">{Object.entries(queue?.status_counts || {}).map(([status, count]) => <div key={status} className="flex justify-between rounded-2xl bg-[#EEF4FF] p-4"><span className="font-black capitalize">{status}</span><span className="font-black">{String(count)}</span></div>)}</div></div>
            <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="text-xl font-black">Recent Jobs</h2><div className="mt-5 space-y-3">{(queue?.recent_jobs || []).slice(0, 30).map((job: AnyRow) => <div key={job.id} className="rounded-2xl bg-[#EEF4FF] p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{job.project_title || job.current_stage}</p><p className="mt-1 text-xs text-slate-500">{job.user_email || job.project_id}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-black ring-1 ${statusTone(job.status)}`}>{job.status}</span></div><p className="mt-2 text-xs font-semibold text-slate-500">{job.current_stage} • Progress {job.progress_percent}% • Retry {job.retry_count}</p></div>)}</div></div>
          </section>
        )}
      </div>
    </main>
  );
}
