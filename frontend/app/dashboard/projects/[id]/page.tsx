"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { apiFetch, clearToken, getCurrentUser, getToken } from "../../../../lib/auth";

const backendUrl = "http://localhost:8000";

function getErrorMessage(errorData: unknown): string {
  if (!errorData) return "Request failed. Please try again.";
  if (typeof errorData === "string") return errorData;
  if (Array.isArray(errorData)) return errorData.map((item) => getErrorMessage(item)).join(" | ");
  if (typeof errorData === "object") {
    const data = errorData as Record<string, unknown>;
    if (typeof data.message === "string") return data.message;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.msg === "string") return data.msg;
    if (Array.isArray(data.detail)) return getErrorMessage(data.detail);
  }
  return "Something went wrong.";
}

function formatOutputFormat(value: string | null | undefined): string {
  if (value === "reel_fit" || value === "reel") return "Reel 9:16 - Fit";
  if (value === "reel_crop") return "Reel 9:16 - Fill/Crop";
  if (value === "square_crop") return "Square 1:1";
  if (value === "original") return "Original Ratio";
  return value || "-";
}

function formatPosition(value: string | null | undefined): string {
  if (!value) return "-";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return "-";
  const safeSeconds = Math.max(0, Number(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function statusTone(status: string | null | undefined): string {
  if (status === "completed") return "bg-green-100 text-green-700 ring-green-200";
  if (status === "failed") return "bg-red-100 text-red-700 ring-red-200";
  if (status === "processing") return "bg-blue-100 text-blue-700 ring-blue-200";
  return "bg-amber-100 text-amber-700 ring-amber-200";
}

function stageActive(progress: number, min: number): boolean {
  return Number(progress || 0) >= min;
}

function stageDone(progress: number, min: number): boolean {
  return Number(progress || 0) >= min;
}

function featureList(project: any) {
  const features = [];
  if (project?.watermark_type === "text" && project?.watermark_text) features.push("Text Watermark");
  if (project?.title_overlay_text) features.push("Title Overlay");
  if (project?.image_overlay_url) features.push("Image Overlay");
  if (project?.outro_url) features.push("Outro");
  return features;
}

function ProjectDetailsContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;
  const autoStart = searchParams.get("autostart");
  const autoStartDoneRef = useRef(false);

  const [project, setProject] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [zipFile, setZipFile] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [retrying, setRetrying] = useState(false);

  async function loadAll() {
    try {
      const [projectRes, statusRes, clipsRes, zipRes] = await Promise.all([
        apiFetch(`/projects/${projectId}`, { cache: "no-store" }),
        apiFetch(`/projects/${projectId}/status`, { cache: "no-store" }),
        apiFetch(`/projects/${projectId}/clips`, { cache: "no-store" }),
        apiFetch(`/projects/${projectId}/zip`, { cache: "no-store" }),
      ]);
      if (projectRes.ok) setProject((await projectRes.json()).data);
      if (statusRes.ok) setStatus((await statusRes.json()).data);
      if (clipsRes.ok) setClips((await clipsRes.json()).data || []);
      if (zipRes.ok) setZipFile((await zipRes.json()).data);
    } catch {
      setMessage("Backend connect nahi ho raha. Backend API running hai ya nahi check karo.");
    }
  }

  async function startProcessing(startMessage = "Processing queue me add ho raha hai...") {
    setRetrying(true);
    setMessage("");
    try {
      const res = await apiFetch(`/projects/${projectId}/process`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const errorMessage = getErrorMessage(data);
        const lowerMessage = errorMessage.toLowerCase();

        const isHarmlessStateMessage =
          lowerMessage.includes("already completed") ||
          lowerMessage.includes("already processing") ||
          lowerMessage.includes("already queued") ||
          lowerMessage.includes("processing already queued");

        setMessage(isHarmlessStateMessage ? "" : errorMessage);
      } else {
        setMessage(startMessage ? "" : "");
      }
      await loadAll();
    } catch {
      setMessage("Backend connect nahi ho raha. Processing start nahi hui.");
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    getCurrentUser()
      .then(() => {
        loadAll();
      })
      .catch(() => {
        clearToken();
        router.push("/login");
      });

    const interval = setInterval(loadAll, 3000);
    return () => clearInterval(interval);
  }, [projectId, router]);

  useEffect(() => {
    if (autoStart !== "1" || autoStartDoneRef.current) return;
    autoStartDoneRef.current = true;
    startProcessing("");
  }, [autoStart, projectId]);

  function downloadUrl(url: string | null) {
    if (!url) return "#";
    return url.startsWith("http") ? url : `${backendUrl}${url}`;
  }

  const canRetry = project?.status === "failed";
  const progress = Number(status?.progress_percent || 0);
  const features = featureList(project);

  const stages = [
    { label: "Download", min: 10, done: 25 },
    { label: "Clips", min: 40, done: 55 },
    { label: "Branding", min: 65, done: 76 },
    { label: "ZIP", min: 82, done: 100 },
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link href="/dashboard/projects" className="text-sm font-semibold text-slate-600 hover:text-slate-950">← Back to Projects</Link>

        <div className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 p-7 text-white shadow-xl shadow-blue-200">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-50">Project Details</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">{project?.title || "Loading project..."}</h1>
              <p className="mt-3 max-w-3xl break-all text-sm text-blue-50">{project?.original_url || "Please wait..."}</p>
            </div>
            <span className={`w-fit rounded-full px-4 py-2 text-sm font-bold ring-1 ${statusTone(project?.status)}`}>
              {project?.status || "loading"}
            </span>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/20 backdrop-blur">
              <p className="text-xs text-blue-50">Clip Length</p>
              <p className="mt-1 text-xl font-black">{project?.clip_length || "-"}s</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/20 backdrop-blur">
              <p className="text-xs text-blue-50">Format</p>
              <p className="mt-1 text-lg font-black">{formatOutputFormat(project?.output_format)}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/20 backdrop-blur">
              <p className="text-xs text-blue-50">Video Duration</p>
              <p className="mt-1 text-xl font-black">{formatDuration(project?.video_duration)}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/20 backdrop-blur">
              <p className="text-xs text-blue-50">Generated Clips</p>
              <p className="mt-1 text-xl font-black">{clips.length}</p>
            </div>
          </div>
        </div>

        {status && (
          <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-black">Processing Status</h2>
                <p className="mt-1 text-sm text-slate-600">{status.current_stage}</p>
              </div>
              <p className="text-2xl font-black">{progress}%</p>
            </div>

            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-3 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all" style={{ width: `${progress}%` }} />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {stages.map((stage) => {
                const active = stageActive(progress, stage.min);
                const done = stageDone(progress, stage.done);
                return (
                  <div key={stage.label} className={`rounded-2xl p-4 ring-1 ${done ? "bg-green-50 ring-green-200" : active ? "bg-blue-50 ring-blue-200" : "bg-slate-50 ring-slate-200"}`}>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${done ? "bg-green-600 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                      {done ? "✓" : stage.min}
                    </div>
                    <p className="mt-3 font-bold">{stage.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{done ? "Done" : active ? "Running" : "Waiting"}</p>
                  </div>
                );
              })}
            </div>

            {canRetry && (
              <button onClick={() => startProcessing("Retry queue me add ho raha hai...")} disabled={retrying} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
                {retrying ? "Retrying..." : "Retry Processing"}
              </button>
            )}
            {message && <p className="mt-3 rounded-xl bg-red-50 p-3 text-red-700">{message}</p>}
          </div>
        )}

        {zipFile?.download_url && (
          <div className="mt-6 rounded-3xl bg-gradient-to-br from-green-50 to-emerald-100 p-6 text-green-950 ring-1 ring-green-200">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-green-700">Completed</p>
                <h2 className="mt-1 text-2xl font-black">Final ZIP Ready</h2>
                <p className="mt-1 text-sm">Download links 24 hours ke baad expire ho jayenge.</p>
              </div>
              <a href={downloadUrl(zipFile.download_url)} target="_blank" className="rounded-2xl bg-green-700 px-6 py-4 text-center font-black text-white shadow-sm hover:bg-green-800">
                Download All ZIP
              </a>
            </div>
          </div>
        )}

        {features.length > 0 && (
          <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black">Creator Effects</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {features.map((feature) => (
                <span key={feature} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                  {feature}
                </span>
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {project?.watermark_type === "text" && project?.watermark_text && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Watermark</p>
                  <p className="mt-1 font-bold">{project.watermark_text}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatPosition(project.watermark_position)} • {project.watermark_opacity || 70}%</p>
                </div>
              )}
              {project?.title_overlay_text && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Title</p>
                  <p className="mt-1 font-bold">{project.title_overlay_text}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatPosition(project.title_overlay_position)} • {project.title_overlay_opacity || 85}%</p>
                </div>
              )}
              {project?.image_overlay_url && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Image Overlay</p>
                  <img src={downloadUrl(project.image_overlay_url)} alt="Overlay" className="mt-2 max-h-16 rounded-lg object-contain" />
                  <p className="mt-2 text-xs text-slate-500">{formatPosition(project.image_overlay_position)} • {formatPosition(project.image_overlay_size)}</p>
                </div>
              )}
              {project?.outro_url && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Outro</p>
                  <p className="mt-1 font-bold">{formatPosition(project.outro_type)}</p>
                  <p className="mt-1 text-xs text-slate-500">{project.outro_duration_seconds || 3}s</p>
                  <a href={downloadUrl(project.outro_url)} target="_blank" className="mt-2 inline-block text-sm font-bold text-slate-950 underline">View Outro</a>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-black">Generated Clips</h2>
              <p className="mt-1 text-sm text-slate-500">Final processed clips yahan download kar sakte ho.</p>
            </div>
            <p className="text-sm font-bold text-slate-500">{clips.length} clips</p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {clips.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-slate-500 md:col-span-3">
                Abhi clips generate nahi hui.
              </div>
            )}
            {clips.map((clip) => (
              <div key={clip.id} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/60 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">Clip {clip.clip_number}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDuration(clip.duration)} • {clip.storage_status}</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">MP4</span>
                </div>
                {clip.download_url && (
                  <a href={downloadUrl(clip.download_url)} target="_blank" className="mt-4 block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white shadow-sm shadow-blue-100 hover:bg-blue-700">
                    Download Clip
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ProjectDetailsPage() {
  return (
    <Suspense fallback=<main className="min-h-screen bg-[#EEF4FF] px-4 py-8 text-slate-950">Loading...</main>>
      <ProjectDetailsContent />
    </Suspense>
  );
}
