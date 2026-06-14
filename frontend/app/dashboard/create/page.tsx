"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, clearToken, getCurrentUser, getToken } from "../../../lib/auth";

type CreatedProject = {
  id: string;
  title: string;
  youtube_video_id: string;
  original_url: string;
  clip_length: number;
  output_format: string;
  status: string;
};

type UserData = {
  email: string;
  plan_key: string;
  is_email_verified: boolean;
};

function getErrorMessage(errorData: unknown): string {
  if (!errorData) return "Request failed. Please try again.";

  if (typeof errorData === "string") return errorData;

  if (Array.isArray(errorData)) {
    return errorData
      .map((item) => getErrorMessage(item))
      .filter(Boolean)
      .join(" | ");
  }

  if (typeof errorData === "object") {
    const data = errorData as Record<string, unknown>;

    if (typeof data.message === "string") return data.message;
    if (typeof data.detail === "string") return data.detail;
    if (typeof data.msg === "string") return data.msg;

    if (Array.isArray(data.detail)) return getErrorMessage(data.detail);
    if (typeof data.detail === "object" && data.detail !== null) return getErrorMessage(data.detail);
  }

  return "Invalid request. Please check YouTube URL and try again.";
}

function isLikelyYoutubeUrl(value: string): boolean {
  const url = value.trim();
  return (
    url.startsWith("https://www.youtube.com/") ||
    url.startsWith("https://youtube.com/") ||
    url.startsWith("https://youtu.be/") ||
    url.startsWith("http://www.youtube.com/") ||
    url.startsWith("http://youtube.com/") ||
    url.startsWith("http://youtu.be/")
  );
}

function planBadgeClass(enabled: boolean): string {
  return enabled
    ? "bg-[#22C55E]/10 text-[#15803D] ring-[#22C55E]/20"
    : "bg-[#F59E0B]/10 text-[#B45309] ring-[#F59E0B]/20";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-bold text-slate-800">{children}</label>;
}

function SectionHeader({
  step,
  title,
  description,
  right,
}: {
  step: string;
  title: string;
  description: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB] text-sm font-black text-white shadow-sm">
          {step}
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

export default function CreateProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [clipLength, setClipLength] = useState(30);
  const [outputFormat, setOutputFormat] = useState("reel_fit");
  const [user, setUser] = useState<UserData | null>(null);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkPosition, setWatermarkPosition] = useState("bottom_right");
  const [watermarkOpacity, setWatermarkOpacity] = useState(70);
  const [titleOverlayEnabled, setTitleOverlayEnabled] = useState(false);
  const [titleOverlayText, setTitleOverlayText] = useState("");
  const [titleOverlayPosition, setTitleOverlayPosition] = useState("top");
  const [titleOverlayOpacity, setTitleOverlayOpacity] = useState(85);
  const [titleOverlayFontSize, setTitleOverlayFontSize] = useState(64);
  const [imageOverlayEnabled, setImageOverlayEnabled] = useState(false);
  const [imageOverlayFile, setImageOverlayFile] = useState<File | null>(null);
  const [imageOverlayPosition, setImageOverlayPosition] = useState("top_right");
  const [imageOverlaySize, setImageOverlaySize] = useState("medium");
  const [imageOverlayOpacity, setImageOverlayOpacity] = useState(100);
  const [outroEnabled, setOutroEnabled] = useState(false);
  const [outroFile, setOutroFile] = useState<File | null>(null);
  const [outroDurationSeconds, setOutroDurationSeconds] = useState(3);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");

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
  }, [router]);

  const canUseCreatorFeatures = user?.plan_key === "creator";
  const canUseWatermark = canUseCreatorFeatures;

  async function uploadImageOverlay() {
    if (!imageOverlayFile) return null;

    const formData = new FormData();
    formData.append("file", imageOverlayFile);

    const res = await apiFetch("/projects/overlay-image", {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      throw new Error(getErrorMessage(data));
    }

    return data.data as { storage_path: string; download_url: string };
  }

  async function uploadOutroFile() {
    if (!outroFile) return null;

    const formData = new FormData();
    formData.append("file", outroFile);

    const res = await apiFetch("/projects/outro-file", {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      throw new Error(getErrorMessage(data));
    }

    return data.data as { storage_path: string; download_url: string; outro_type: "image" | "video" };
  }

  async function createAndProcessProject() {
    setError("");
    setStage("");

    if (!youtubeUrl.trim()) {
      setError("Please enter a YouTube URL.");
      return;
    }

    if (!isLikelyYoutubeUrl(youtubeUrl)) {
      setError("Invalid or unsupported YouTube URL");
      return;
    }

    if (watermarkEnabled && canUseWatermark && !watermarkText.trim()) {
      setError("Watermark text required.");
      return;
    }

    if (titleOverlayEnabled && canUseCreatorFeatures && !titleOverlayText.trim()) {
      setError("Title overlay text required.");
      return;
    }

    if (imageOverlayEnabled && canUseCreatorFeatures && !imageOverlayFile) {
      setError("Overlay image required.");
      return;
    }

    if (outroEnabled && canUseCreatorFeatures && !outroFile) {
      setError("Outro file required.");
      return;
    }

    setLoading(true);

    try {
      let imageOverlayData: { storage_path: string; download_url: string } | null = null;
      if (imageOverlayEnabled && canUseCreatorFeatures) {
        setStage("Overlay image upload ho rahi hai...");
        imageOverlayData = await uploadImageOverlay();
      }

      let outroData: { storage_path: string; download_url: string; outro_type: "image" | "video" } | null = null;
      if (outroEnabled && canUseCreatorFeatures) {
        setStage("Outro file upload ho rahi hai...");
        outroData = await uploadOutroFile();
      }

      setStage("Project create ho raha hai...");
      const createRes = await apiFetch("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || null,
          youtube_url: youtubeUrl,
          clip_length: Number(clipLength),
          output_format: outputFormat,
          watermark_type: canUseWatermark && watermarkEnabled ? "text" : null,
          watermark_text: canUseWatermark && watermarkEnabled ? watermarkText : null,
          watermark_position: canUseWatermark && watermarkEnabled ? watermarkPosition : null,
          watermark_opacity: canUseWatermark && watermarkEnabled ? Number(watermarkOpacity) : 70,
          title_overlay_text: canUseCreatorFeatures && titleOverlayEnabled ? titleOverlayText : null,
          title_overlay_position: canUseCreatorFeatures && titleOverlayEnabled ? titleOverlayPosition : null,
          title_overlay_opacity: canUseCreatorFeatures && titleOverlayEnabled ? Number(titleOverlayOpacity) : 85,
          title_overlay_font_size: canUseCreatorFeatures && titleOverlayEnabled ? Number(titleOverlayFontSize) : 64,
          image_overlay_path: canUseCreatorFeatures && imageOverlayEnabled ? imageOverlayData?.storage_path || null : null,
          image_overlay_url: canUseCreatorFeatures && imageOverlayEnabled ? imageOverlayData?.download_url || null : null,
          image_overlay_position: canUseCreatorFeatures && imageOverlayEnabled ? imageOverlayPosition : null,
          image_overlay_size: canUseCreatorFeatures && imageOverlayEnabled ? imageOverlaySize : "medium",
          image_overlay_opacity: canUseCreatorFeatures && imageOverlayEnabled ? Number(imageOverlayOpacity) : 100,
          outro_path: canUseCreatorFeatures && outroEnabled ? outroData?.storage_path || null : null,
          outro_url: canUseCreatorFeatures && outroEnabled ? outroData?.download_url || null : null,
          outro_type: canUseCreatorFeatures && outroEnabled ? outroData?.outro_type || null : null,
          outro_duration_seconds: canUseCreatorFeatures && outroEnabled ? Number(outroDurationSeconds) : 3,
        }),
      });

      const createData = await createRes.json().catch(() => null);
      if (!createRes.ok) {
        setError(getErrorMessage(createData));
        return;
      }

      const createdProject = createData.data as CreatedProject;
      setStage("Project page open ho raha hai...");
      router.push(`/dashboard/projects/${createdProject.id}?autostart=1`);
    } catch {
      setError("Backend connect nahi ho raha. Backend, PostgreSQL, Redis aur Celery run hain ya nahi check karo.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-950 outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10";
  const selectClass = inputClass;

  return (
    <main className="min-h-screen bg-[#EEF4FF]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] p-5 text-white shadow-xl sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20">
                AI Video Clipping
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Create New Project
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
                YouTube link paste karo, reel settings choose karo, branding add karo aur final ZIP generate karo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:flex">
              <div className="rounded-2xl bg-white/15 px-4 py-3 ring-1 ring-white/20">
                <p className="text-xs text-blue-100">Current Plan</p>
                <p className="font-black capitalize">{user?.plan_key || "loading"}</p>
              </div>
              <div className="rounded-2xl bg-white/15 px-4 py-3 ring-1 ring-white/20">
                <p className="text-xs text-blue-100">Creator Tools</p>
                <p className="font-black">{canUseCreatorFeatures ? "Unlocked" : "Locked"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <SectionHeader
                step="1"
                title="Video Source"
                description="Project name optional hai. YouTube URL required hai."
              />

              <div className="mt-6 grid gap-5">
                <div>
                  <FieldLabel>Project Title</FieldLabel>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Podcast Episode Clips" />
                </div>

                <div>
                  <FieldLabel>YouTube URL</FieldLabel>
                  <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} className={inputClass} placeholder="https://www.youtube.com/watch?v=..." />
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <SectionHeader
                step="2"
                title="Output Settings"
                description="Clip duration aur output ratio choose karo."
              />

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel>Clip Length</FieldLabel>
                  <select value={clipLength} onChange={(e) => setClipLength(Number(e.target.value))} className={selectClass}>
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </div>

                <div>
                  <FieldLabel>Output Format</FieldLabel>
                  <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className={selectClass}>
                    <option value="reel_fit">Reel 9:16 - Fit Full Video</option>
                    <option value="reel_crop">Reel 9:16 - Fill/Crop</option>
                    <option value="square_crop">Square 1:1 - Fill/Crop</option>
                    <option value="original">Original Ratio</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <SectionHeader
                step="3"
                title="Creator Branding"
                description="Creator plan ke effects yahan se enable karo."
                right={
                  <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ring-1 ${planBadgeClass(canUseCreatorFeatures)}`}>
                    {canUseCreatorFeatures ? "Creator unlocked" : "Creator only"}
                  </span>
                }
              />

              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-black text-slate-950">Text Watermark</h3>
                      <p className="mt-1 text-sm text-slate-600">Har generated clip par brand text add hoga.</p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-bold ring-1 ring-slate-200">
                      <input type="checkbox" checked={watermarkEnabled} disabled={!canUseWatermark} onChange={(e) => setWatermarkEnabled(e.target.checked)} />
                      Enable
                    </label>
                  </div>

                  {watermarkEnabled && (
                    <div className={!canUseWatermark ? "pointer-events-none mt-5 opacity-45" : "mt-5"}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <FieldLabel>Watermark Text</FieldLabel>
                          <input value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} className={inputClass} placeholder="@yourbrand or website" />
                        </div>
                        <div>
                          <FieldLabel>Position</FieldLabel>
                          <select value={watermarkPosition} onChange={(e) => setWatermarkPosition(e.target.value)} className={selectClass}>
                            <option value="top_left">Top Left</option>
                            <option value="top_right">Top Right</option>
                            <option value="bottom_left">Bottom Left</option>
                            <option value="bottom_right">Bottom Right</option>
                            <option value="center">Center</option>
                          </select>
                        </div>
                        <div>
                          <FieldLabel>Opacity</FieldLabel>
                          <select value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} className={selectClass}>
                            <option value={30}>30%</option>
                            <option value={50}>50%</option>
                            <option value={70}>70%</option>
                            <option value={100}>100%</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-black text-slate-950">Title Overlay</h3>
                      <p className="mt-1 text-sm text-slate-600">Reel par title/caption render hoga.</p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-bold ring-1 ring-slate-200">
                      <input type="checkbox" checked={titleOverlayEnabled} disabled={!canUseCreatorFeatures} onChange={(e) => setTitleOverlayEnabled(e.target.checked)} />
                      Enable
                    </label>
                  </div>

                  {titleOverlayEnabled && (
                    <div className={!canUseCreatorFeatures ? "pointer-events-none mt-5 opacity-45" : "mt-5"}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <FieldLabel>Title Text</FieldLabel>
                          <input value={titleOverlayText} onChange={(e) => setTitleOverlayText(e.target.value)} className={inputClass} placeholder="5 AI Tools Every Creator Should Use" />
                        </div>
                        <div>
                          <FieldLabel>Position</FieldLabel>
                          <select value={titleOverlayPosition} onChange={(e) => setTitleOverlayPosition(e.target.value)} className={selectClass}>
                            <option value="top">Top</option>
                            <option value="center">Center</option>
                            <option value="bottom">Bottom</option>
                          </select>
                        </div>
                        <div>
                          <FieldLabel>Font Size</FieldLabel>
                          <select value={titleOverlayFontSize} onChange={(e) => setTitleOverlayFontSize(Number(e.target.value))} className={selectClass}>
                            <option value={48}>Small</option>
                            <option value={64}>Medium</option>
                            <option value={78}>Large</option>
                          </select>
                        </div>
                        <div>
                          <FieldLabel>Opacity</FieldLabel>
                          <select value={titleOverlayOpacity} onChange={(e) => setTitleOverlayOpacity(Number(e.target.value))} className={selectClass}>
                            <option value={50}>50%</option>
                            <option value={70}>70%</option>
                            <option value={85}>85%</option>
                            <option value={100}>100%</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-black text-slate-950">Image / Logo Overlay</h3>
                      <p className="mt-1 text-sm text-slate-600">Logo, icon ya custom image video ke upar render hogi.</p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-bold ring-1 ring-slate-200">
                      <input type="checkbox" checked={imageOverlayEnabled} disabled={!canUseCreatorFeatures} onChange={(e) => setImageOverlayEnabled(e.target.checked)} />
                      Enable
                    </label>
                  </div>

                  {imageOverlayEnabled && (
                    <div className={!canUseCreatorFeatures ? "pointer-events-none mt-5 opacity-45" : "mt-5"}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <FieldLabel>Overlay Image</FieldLabel>
                          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setImageOverlayFile(e.target.files?.[0] || null)} className={inputClass} />
                          <p className="mt-2 text-xs text-slate-500">PNG/JPG/WEBP, max 5MB. Transparent PNG logo best rahega.</p>
                        </div>
                        <div>
                          <FieldLabel>Position</FieldLabel>
                          <select value={imageOverlayPosition} onChange={(e) => setImageOverlayPosition(e.target.value)} className={selectClass}>
                            <option value="top_left">Top Left</option>
                            <option value="top_right">Top Right</option>
                            <option value="bottom_left">Bottom Left</option>
                            <option value="bottom_right">Bottom Right</option>
                            <option value="center">Center</option>
                          </select>
                        </div>
                        <div>
                          <FieldLabel>Size</FieldLabel>
                          <select value={imageOverlaySize} onChange={(e) => setImageOverlaySize(e.target.value)} className={selectClass}>
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                          </select>
                        </div>
                        <div>
                          <FieldLabel>Opacity</FieldLabel>
                          <select value={imageOverlayOpacity} onChange={(e) => setImageOverlayOpacity(Number(e.target.value))} className={selectClass}>
                            <option value={50}>50%</option>
                            <option value={70}>70%</option>
                            <option value={100}>100%</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-black text-slate-950">Outro / End Screen</h3>
                      <p className="mt-1 text-sm text-slate-600">Har generated clip ke end me image/video outro add hoga.</p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-bold ring-1 ring-slate-200">
                      <input type="checkbox" checked={outroEnabled} disabled={!canUseCreatorFeatures} onChange={(e) => setOutroEnabled(e.target.checked)} />
                      Enable
                    </label>
                  </div>

                  {outroEnabled && (
                    <div className={!canUseCreatorFeatures ? "pointer-events-none mt-5 opacity-45" : "mt-5"}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <FieldLabel>Outro File</FieldLabel>
                          <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime" onChange={(e) => setOutroFile(e.target.files?.[0] || null)} className={inputClass} />
                          <p className="mt-2 text-xs text-slate-500">PNG/JPG/WEBP/MP4/MOV. Image outro sabse stable rahega.</p>
                        </div>
                        <div>
                          <FieldLabel>Outro Duration</FieldLabel>
                          <select value={outroDurationSeconds} onChange={(e) => setOutroDurationSeconds(Number(e.target.value))} className={selectClass}>
                            <option value={2}>2 seconds</option>
                            <option value={3}>3 seconds</option>
                            <option value={5}>5 seconds</option>
                            <option value={10}>10 seconds</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-6 lg:h-fit">
            <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
              <h2 className="text-lg font-black text-slate-950">Generate Clips</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Settings check karo aur processing start karo. Project details page par live progress dikhegi.
              </p>

              <div className="mt-5 space-y-3 rounded-2xl bg-[#EEF4FF] p-4">
                <div className="flex justify-between gap-4 text-sm">
                  <span className="font-semibold text-slate-600">Clip Length</span>
                  <span className="font-black text-slate-950">{clipLength}s</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="font-semibold text-slate-600">Format</span>
                  <span className="text-right font-black text-slate-950">{outputFormat.replace("_", " ")}</span>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="font-semibold text-slate-600">Branding</span>
                  <span className="font-black text-slate-950">
                    {[watermarkEnabled, titleOverlayEnabled, imageOverlayEnabled, outroEnabled].filter(Boolean).length} enabled
                  </span>
                </div>
              </div>

              <button
                onClick={createAndProcessProject}
                disabled={loading}
                className="mt-5 w-full rounded-2xl bg-[#2563EB] px-6 py-4 text-base font-black text-white shadow-sm transition hover:bg-[#0633AD] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating..." : "Create & Process"}
              </button>

              {stage && <div className="mt-4 rounded-2xl bg-[#06B6D4]/10 p-4 text-sm font-bold text-[#0E7490]">{stage}</div>}
              {error && <div className="mt-4 rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">{error}</div>}
            </div>

          </aside>
        </div>
      </div>
    </main>
  );
}
