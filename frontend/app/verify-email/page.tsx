"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch, getCurrentUser, getToken } from "../../lib/auth";

function getErrorMessage(data: any): string {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  return "Something went wrong. Please try again.";
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/dashboard";
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    getCurrentUser()
      .then((user) => {
        setEmail(user.email);
        if (user.is_email_verified) router.push(nextUrl);
      })
      .catch(() => router.push("/login"));
  }, [router, nextUrl]);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function verifyOtp() {
    setError("");
    setMessage("");
    setLoading(true);

    if (otp.trim().length < 4) {
      setError("Please enter a valid OTP.");
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch("/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otp.trim() }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(getErrorMessage(data));
        return;
      }

      setMessage("Email verified successfully. Redirect ho raha hai...");
      router.push(nextUrl);
    } catch {
      setError("Backend connect nahi ho raha.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (cooldown > 0) return;

    setError("");
    setMessage("");
    setResending(true);

    try {
      const res = await apiFetch("/auth/email/send-otp", { method: "POST" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(getErrorMessage(data));
        return;
      }

      setMessage(data.message || "OTP sent.");
      setCooldown(60);
    } catch {
      setError("Backend connect nahi ho raha.");
    } finally {
      setResending(false);
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
                Email Security
              </p>
              <h1 className="mt-6 text-5xl font-black leading-tight tracking-tight xl:text-6xl">
                Verify your email to unlock your dashboard.
              </h1>
              <p className="mt-6 text-lg leading-8 text-blue-50">
                OTP verify karne ke baad aap ClipForge dashboard, project processing aur billing features access kar paoge.
              </p>
            </div>
          </div>

          <div className="relative grid gap-4 xl:grid-cols-2">
            {[
              ["🔐", "Secure Account", "OTP verification se account safe rahega."],
              ["⚡", "Fast Access", "Verify ke baad direct dashboard open hoga."],
              ["🎬", "Create Projects", "YouTube link se reels generate karo."],
              ["✨", "Creator Tools", "Branding aur outro tools unlock karo."],
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
                  Verify Email
                </p>
                <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Enter OTP Code</h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {email ? <><span className="font-black text-slate-950">{email}</span> par OTP bheja gaya hai.</> : "Apna email verify karo."}
                </p>
              </div>

              <div className="mt-7">
                <label className="text-sm font-bold text-slate-800">OTP Code</label>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-center text-2xl font-black tracking-[0.35em] text-slate-950 outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                  placeholder="000000"
                  maxLength={6}
                />

                <button
                  onClick={verifyOtp}
                  disabled={loading}
                  className="mt-6 w-full rounded-2xl bg-[#2563EB] px-6 py-4 text-base font-black text-white shadow-sm transition hover:bg-[#0633AD] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Verifying..." : "Verify Email"}
                </button>

                <button
                  onClick={resendOtp}
                  disabled={resending || cooldown > 0}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-6 py-4 text-base font-black text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resending ? "Sending..." : cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
                </button>

                {message && <div className="mt-5 rounded-2xl bg-[#22C55E]/10 p-4 text-sm font-bold text-[#15803D]">{message}</div>}
                {error && <div className="mt-5 rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">{error}</div>}

                <p className="mt-6 text-center text-sm text-slate-600">
                  Already verified? <Link href="/dashboard" className="font-black text-[#2563EB] hover:text-[#0633AD]">Go to Dashboard</Link>
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-xs font-semibold text-slate-500">
              OTP verification • Secure account • Dashboard access
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback=<main className="min-h-screen bg-[#EEF4FF] px-4 py-8 text-slate-950">Loading...</main>>
      <VerifyEmailContent />
    </Suspense>
  );
}
