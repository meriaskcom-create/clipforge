"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, clearToken, getCurrentUser, getToken } from "../../../lib/auth";

const backendUrl = "http://localhost:8000";

function getErrorMessage(data: any): string {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  return "Something went wrong.";
}

function downloadUrl(url: string | null | undefined) {
  if (!url) return "#";
  return url.startsWith("http") ? url : `${backendUrl}${url}`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-bold text-slate-800">{children}</label>;
}

function SectionHeader({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB] text-sm font-black text-white shadow-sm">
        {step}
      </div>
      <div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </div>
  );
}

export default function BulkBrandReelsPage() {
  const router = useRouter();

  const [reels, setReels] = useState<File[]>([]);
  const [logo, setLogo] = useState<File | null>(null);
  const [outro, setOutro] = useState<File | null>(null);

  const [titleText, setTitleText] = useState("");
  const [watermarkText, setWatermarkText] = useState("");
  const [logoPosition, setLogoPosition] = useState("bottom_right");
  const [logoSize, setLogoSize] = useState("medium");
  const [logoOpacity, setLogoOpacity] = useState(100);
  const [outroDuration, setOutroDuration] = useState(3);

  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    getCurrentUser().catch(() => {
      clearToken();
      router.push("/login");
    });
  }, [router]);

  async function processBulkReels() {
    setError("");
    setResult(null);
    setStage("");

    if (!reels.length) {
      setError("At least one reel upload karo.");
      return;
    }

    setLoading(true);
    try {
      setStage("Files upload aur processing start ho rahi hai...");

      const formData = new FormData();
      reels.forEach((file) => formData.append("reels", file));
      if (logo) formData.append("logo", logo);
      if (outro) formData.append("outro", outro);

      formData.append("title_text", titleText);
      formData.append("watermark_text", watermarkText);
      formData.append("logo_position", logoPosition);
      formData.append("logo_size", logoSize);
      formData.append("logo_opacity", String(logoOpacity));
      formData.append("outro_duration", String(outroDuration));

      const res = await apiFetch("/bulk-branding/process", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(getErrorMessage(data));
        return;
      }

      setResult(data.data);
      setStage("");
    } catch {
      setError("Backend connect nahi ho raha ya processing fail hui.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-950 outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10";
  const selectedFileCount = reels.length;

  return (
    <main className="min-h-screen bg-[#EEF4FF]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <Link href="/dashboard" className="text-sm font-bold text-slate-600 hover:text-slate-950">
          ← Back to Dashboard
        </Link>

        <div className="mt-5 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] p-5 text-white shadow-xl sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20">
                Bulk Branding Studio
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Bulk Brand Reels
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
                Already-created reels upload karo, title, watermark, logo aur outro add karo, phir final ZIP download karo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:flex">
              <div className="rounded-2xl bg-white/15 px-4 py-3 ring-1 ring-white/20">
                <p className="text-xs text-blue-100">Selected Reels</p>
                <p className="font-black">{selectedFileCount}</p>
              </div>
              <div className="rounded-2xl bg-white/15 px-4 py-3 ring-1 ring-white/20">
                <p className="text-xs text-blue-100">Output</p>
                <p className="font-black">ZIP</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <SectionHeader
                step="1"
                title="Upload Reels"
                description="MP4/MOV/MKV reels upload karo. Ek batch me max 20 reels recommended."
              />

              <div className="mt-6 rounded-2xl border-2 border-dashed border-[#2563EB]/25 bg-[#EEF4FF] p-5">
                <FieldLabel>Reel Files</FieldLabel>
                <input
                  type="file"
                  multiple
                  accept="video/mp4,video/quicktime,video/x-matroska"
                  onChange={(e) => setReels(Array.from(e.target.files || []))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-950 file:mr-4 file:rounded-xl file:border-0 file:bg-[#2563EB] file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                />
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  {selectedFileCount > 0 ? `${selectedFileCount} reel selected.` : "No reel selected yet."}
                </p>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <SectionHeader
                step="2"
                title="Text Branding"
                description="Caption/title aur watermark text optional hai. Empty chhoda to skip ho jayega."
              />

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel>Title / Caption</FieldLabel>
                  <input
                    value={titleText}
                    onChange={(e) => setTitleText(e.target.value)}
                    className={inputClass}
                    placeholder="5 AI Tools Every Creator Should Use"
                  />
                </div>

                <div>
                  <FieldLabel>Watermark Text</FieldLabel>
                  <input
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className={inputClass}
                    placeholder="@yourbrand"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <SectionHeader
                step="3"
                title="Logo / Image Overlay"
                description="Logo ya icon upload karo aur position, size, opacity set karo."
              />

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <FieldLabel>Logo/Image</FieldLabel>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setLogo(e.target.files?.[0] || null)}
                    className={inputClass}
                  />
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {logo ? logo.name : "PNG/JPG/WEBP supported. Transparent PNG best rahega."}
                  </p>
                </div>

                <div>
                  <FieldLabel>Position</FieldLabel>
                  <select value={logoPosition} onChange={(e) => setLogoPosition(e.target.value)} className={inputClass}>
                    <option value="top_left">Top Left</option>
                    <option value="top_right">Top Right</option>
                    <option value="bottom_left">Bottom Left</option>
                    <option value="bottom_right">Bottom Right</option>
                    <option value="center">Center</option>
                  </select>
                </div>

                <div>
                  <FieldLabel>Size</FieldLabel>
                  <select value={logoSize} onChange={(e) => setLogoSize(e.target.value)} className={inputClass}>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                <div>
                  <FieldLabel>Opacity</FieldLabel>
                  <select value={logoOpacity} onChange={(e) => setLogoOpacity(Number(e.target.value))} className={inputClass}>
                    <option value={50}>50%</option>
                    <option value={70}>70%</option>
                    <option value={100}>100%</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <SectionHeader
                step="4"
                title="Outro / End Screen"
                description="Optional outro image/video har reel ke end me add hoga."
              />

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <FieldLabel>Outro Image/Video</FieldLabel>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/x-matroska"
                    onChange={(e) => setOutro(e.target.files?.[0] || null)}
                    className={inputClass}
                  />
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {outro ? outro.name : "PNG/JPG/WEBP/MP4/MOV/MKV supported."}
                  </p>
                </div>

                <div>
                  <FieldLabel>Outro Duration</FieldLabel>
                  <select value={outroDuration} onChange={(e) => setOutroDuration(Number(e.target.value))} className={inputClass}>
                    <option value={2}>2 seconds</option>
                    <option value={3}>3 seconds</option>
                    <option value={5}>5 seconds</option>
                    <option value={10}>10 seconds</option>
                  </select>
                </div>
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-6 lg:h-fit">
            <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <h2 className="text-lg font-black text-slate-950">Create Branded ZIP</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Sab reels process hone ke baad final ZIP yahin download ke liye ready hoga.
              </p>

              <div className="mt-5 space-y-3 rounded-2xl bg-[#EEF4FF] p-4">
                <div className="flex justify-between gap-4 text-sm">
                  <span className="font-semibold text-slate-600">Reels</span>
                  <span className="font-black text-slate-950">{selectedFileCount}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="font-semibold text-slate-600">Logo</span>
                  <span className="font-black text-slate-950">{logo ? "Added" : "None"}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="font-semibold text-slate-600">Outro</span>
                  <span className="font-black text-slate-950">{outro ? `${outroDuration}s` : "None"}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="font-semibold text-slate-600">Text</span>
                  <span className="font-black text-slate-950">{[titleText, watermarkText].filter(Boolean).length} items</span>
                </div>
              </div>

              <button
                onClick={processBulkReels}
                disabled={loading}
                className="mt-5 w-full rounded-2xl bg-[#2563EB] px-6 py-4 text-base font-black text-white shadow-sm transition hover:bg-[#0633AD] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Processing..." : "Create Branded ZIP"}
              </button>

              {stage && <div className="mt-4 rounded-2xl bg-[#06B6D4]/10 p-4 text-sm font-bold text-[#0E7490]">{stage}</div>}
              {error && <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">{error}</div>}
            </div>

            {result?.zip_url && (
              <div className="mt-5 rounded-[1.75rem] bg-gradient-to-br from-[#22C55E]/10 to-green-100 p-5 text-green-950 ring-1 ring-[#22C55E]/20">
                <p className="text-sm font-black text-[#15803D]">ZIP Ready</p>
                <h2 className="mt-1 text-2xl font-black">{result.total_files} reels processed</h2>
                <a
                  href={downloadUrl(result.zip_url)}
                  target="_blank"
                  className="mt-5 block rounded-2xl bg-[#22C55E] px-5 py-3 text-center font-black text-white transition hover:bg-[#15803D]"
                >
                  Download Final ZIP
                </a>
              </div>
            )}

          </aside>
        </div>
      </div>
    </main>
  );
}
