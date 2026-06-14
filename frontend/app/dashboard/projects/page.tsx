"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, clearToken, getCurrentUser, getToken } from "../../../lib/auth";

function formatOutputFormat(value: string | null | undefined): string {
  if (value === "reel_fit" || value === "reel") return "Reel 9:16 - Fit";
  if (value === "reel_crop") return "Reel 9:16 - Fill/Crop";
  if (value === "square_crop") return "Square 1:1";
  if (value === "original") return "Original Ratio";
  return value || "-";
}

function statusTone(status: string | null | undefined): string {
  if (status === "completed") return "bg-[#22C55E]/10 text-[#15803D] ring-[#22C55E]/20";
  if (status === "failed") return "bg-[#EF4444]/10 text-[#B91C1C] ring-[#EF4444]/20";
  if (status === "processing") return "bg-[#2563EB]/10 text-[#1D4ED8] ring-[#2563EB]/20";
  return "bg-[#F59E0B]/10 text-[#B45309] ring-[#F59E0B]/20";
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return "Pending";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type Project = {
  id: string;
  title: string;
  status: string;
  clip_length: number;
  output_format: string;
  youtube_video_id?: string | null;
  video_duration?: number | null;
  created_at?: string | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return "-";
  const safeSeconds = Math.max(0, Number(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function projectIcon(status: string | null | undefined): string {
  if (status === "completed") return "✓";
  if (status === "failed") return "!";
  if (status === "processing") return "↻";
  return "▶";
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadProjects() {
    setError("");
    try {
      const res = await apiFetch("/projects", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.detail || "Unable to load projects");
      }

      setProjects(data.data || []);
    } catch (err) {
      setProjects([]);
      setError(getErrorMessage(err));
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
      .then(() => loadProjects())
      .catch(() => {
        clearToken();
        router.push("/login");
      });
  }, [router]);

  async function deleteProject(project: Project) {
    const confirmed = window.confirm(`Delete project "${project.title}"? This will remove its clips and ZIP files.`);
    if (!confirmed) return;

    setDeletingId(project.id);
    setError("");

    try {
      const res = await apiFetch(`/projects/${project.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.detail || "Unable to delete project");
      }

      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  const filteredProjects = useMemo(() => {
    const search = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesSearch =
        !search ||
        project.title.toLowerCase().includes(search) ||
        (project.youtube_video_id || "").toLowerCase().includes(search);

      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, query, statusFilter]);

  const completedCount = projects.filter((project) => project.status === "completed").length;
  const processingCount = projects.filter((project) => project.status === "processing").length;
  const failedCount = projects.filter((project) => project.status === "failed").length;

  return (
    <main className="min-h-screen bg-[#EEF4FF]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] p-5 text-white shadow-xl sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20">
                Project Library
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">My Projects</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
                Saare YouTube clipping projects yahan manage karo. Status check karo, output open karo ya old project delete karo.
              </p>
            </div>

            <Link
              href="/dashboard/create"
              className="rounded-2xl bg-white px-5 py-3.5 text-center text-sm font-black text-[#2563EB] shadow-sm transition hover:bg-blue-50"
            >
              + Create Project
            </Link>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/20">
              <p className="text-xs text-blue-100">Total Projects</p>
              <p className="mt-1 text-2xl font-black">{projects.length}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/20">
              <p className="text-xs text-blue-100">Completed</p>
              <p className="mt-1 text-2xl font-black">{completedCount}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/20">
              <p className="text-xs text-blue-100">Processing</p>
              <p className="mt-1 text-2xl font-black">{processingCount}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/20">
              <p className="text-xs text-blue-100">Failed</p>
              <p className="mt-1 text-2xl font-black">{failedCount}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-[#EF4444]/20 bg-[#EF4444]/10 px-4 py-3 text-sm font-bold text-[#B91C1C]">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div>
              <label className="text-sm font-bold text-slate-800">Search Projects</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-950 outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                placeholder="Search by title or YouTube ID"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-800">Status Filter</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-950 outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {loading && (
            <div className="rounded-[1.75rem] bg-white p-8 text-center text-slate-500 shadow-sm ring-1 ring-slate-200">
              Loading projects...
            </div>
          )}

          {!loading && filteredProjects.length === 0 && (
            <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2563EB]/10 text-2xl font-black text-[#2563EB]">
                +
              </div>
              <h2 className="mt-4 text-xl font-black text-slate-950">No projects found</h2>
              <p className="mt-2 text-sm text-slate-500">Naya project create karo ya filters clear karo.</p>
              <Link
                href="/dashboard/create"
                className="mt-5 inline-block rounded-2xl bg-[#2563EB] px-5 py-3 text-sm font-black text-white transition hover:bg-[#0633AD]"
              >
                Create Project
              </Link>
            </div>
          )}

          {!loading && filteredProjects.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => (
                <div key={project.id} className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-black ring-1 ${statusTone(project.status)}`}>
                        {projectIcon(project.status)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="line-clamp-2 text-lg font-black text-slate-950">{project.title}</h2>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                          {project.youtube_video_id || "YouTube project"}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ring-1 ${statusTone(project.status)}`}>
                      {statusLabel(project.status)}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#EEF4FF] p-3">
                      <p className="text-xs font-semibold text-slate-500">Clip Length</p>
                      <p className="mt-1 font-black text-slate-950">{project.clip_length}s</p>
                    </div>
                    <div className="rounded-2xl bg-[#EEF4FF] p-3">
                      <p className="text-xs font-semibold text-slate-500">Duration</p>
                      <p className="mt-1 font-black text-slate-950">{formatDuration(project.video_duration)}</p>
                    </div>
                    <div className="col-span-2 rounded-2xl bg-[#EEF4FF] p-3">
                      <p className="text-xs font-semibold text-slate-500">Format</p>
                      <p className="mt-1 font-black text-slate-950">{formatOutputFormat(project.output_format)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className="flex-1 rounded-2xl bg-[#2563EB] px-4 py-3 text-center text-sm font-black text-white transition hover:bg-[#0633AD]"
                    >
                      Open Project
                    </Link>
                    <button
                      type="button"
                      onClick={() => deleteProject(project)}
                      disabled={deletingId === project.id}
                      className="rounded-2xl border border-[#EF4444]/20 bg-[#EF4444]/10 px-4 py-3 text-sm font-black text-[#B91C1C] transition hover:bg-[#EF4444]/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-28"
                    >
                      {deletingId === project.id ? "..." : "Delete"}
                    </button>
                  </div>

                  <p className="mt-4 text-xs font-semibold text-slate-400">
                    Created: {formatDate(project.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
