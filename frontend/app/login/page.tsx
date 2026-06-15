"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_URL, setToken } from "../../lib/auth";

function getErrorMessage(data: any): string {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  return "Login failed. Please try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.token) {
        setError(getErrorMessage(data));
        return;
      }

      setToken(data.token);

      if (data?.user && !data.user.is_email_verified) {
        router.push("/verify-email");
        return;
      }

      try {
        const meRes = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${data.token}` },
          cache: "no-store",
        });

        const meData = await meRes.json().catch(() => null);

        if (meRes.ok && meData?.user?.is_admin) {
          router.push("/admin");
          return;
        }
      } catch {
        // Agar admin check fail ho jaye to normal dashboard par bhej do.
      }

      router.push("/dashboard");
    } catch {
      setError("Backend connect nahi ho raha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#EEF4FF]">
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-[#0633AD]/40 blur-3xl" />

          <div className="relative">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-white text-xl font-black text-[#2563EB] shadow-sm">
                CF
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight">ClipForge</p>
                <p className="text-sm font-semibold text-blue-100">AI Video Clipping Platform</p>
              </div>
            </Link>

            <div className="mt-20 max-w-2xl">
              <p className="inline-flex rounded-full bg-white/15 px-4 py-2 text-sm font-bold ring-1 ring-white/20">
                YouTube â†’ Reels â†’ ZIP
              </p>
              <h1 className="mt-6 text-5xl font-black leading-tight tracking-tight xl:text-6xl">
                Turn long videos into branded reels faster.
              </h1>
              <p className="mt-6 text-lg leading-8 text-blue-50">
                Login karo, YouTube link paste karo, clips generate karo aur watermark, title, logo aur outro ke saath final ZIP download karo.
              </p>
            </div>
          </div>

          <div className="relative grid gap-4 xl:grid-cols-2">
            {[
              ["ðŸŽ¬", "YouTube Clipping", "Long videos ko short reels me convert karo."],
              ["âœ¨", "Bulk Branding", "Uploaded reels par title, watermark aur logo add karo."],
              ["ðŸ“¦", "ZIP Downloads", "All final clips ek ZIP me ready."],
              ["âš¡", "Queue Processing", "Multi-stage processing pipeline ready."],
            ].map(([icon, title, desc]) => (
              <div key={title} className="rounded-3xl bg-white/12 p-5 ring-1 ring-white/15 backdrop-blur">
                <p className="text-2xl">{icon}</p>
                <h3 className="mt-3 font-black">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-blue-100">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              <Link href="/" className="inline-flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563EB] text-lg font-black text-white shadow-sm">
                  CF
                </div>
                <div className="text-left">
                  <p className="text-xl font-black tracking-tight text-slate-950">ClipForge</p>
                  <p className="text-xs font-semibold text-slate-500">AI Video Clipping</p>
                </div>
              </Link>
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-slate-200 sm:p-8">
              <div>
                <p className="inline-flex rounded-full bg-[#2563EB]/10 px-3 py-1 text-xs font-black text-[#2563EB] ring-1 ring-[#2563EB]/20">
                  Welcome back
                </p>
                <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Login to ClipForge</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">Apne account se dashboard access karo.</p>
              </div>

              <div className="mt-7">
                <label className="text-sm font-bold text-slate-800">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-950 outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                  placeholder="you@example.com"
                />

                <label className="mt-5 block text-sm font-bold text-slate-800">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-950 outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                  placeholder="Minimum 6 characters"
                />

                <button
                  onClick={login}
                  disabled={loading}
                  className="mt-6 w-full rounded-2xl bg-[#2563EB] px-6 py-4 text-base font-black text-white shadow-sm transition hover:bg-[#0633AD] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Logging in..." : "Login"}
                </button>

                {error && <div className="mt-5 rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">{error}</div>}

                <p className="mt-6 text-center text-sm text-slate-600">
                  New user? <Link href="/signup" className="font-black text-[#2563EB] hover:text-[#0633AD]">Create account</Link>
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-xs font-semibold text-slate-500">
              Secure login â€¢ Dashboard access â€¢ Creator tools
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
