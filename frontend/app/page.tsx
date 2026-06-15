"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { API_URL, getToken } from "../lib/auth";

function PipelineNode({
  step,
  title,
  helper,
  className = "",
}: {
  step: string;
  title: string;
  helper: string;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl bg-white/90 p-4 text-slate-950 shadow-2xl ring-1 ring-white/70 backdrop-blur ${className}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#2563EB] text-sm font-black text-white">
          {step}
        </div>
        <div>
          <p className="font-black">{title}</p>
          <p className="text-xs font-semibold text-slate-500">{helper}</p>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-black uppercase tracking-wide text-[#2563EB]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
      <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">{description}</p>
    </div>
  );
}


function SocialIcon({
  label,
  href,
  children,
}: {
  label: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-white hover:text-slate-950"
    >
      {children}
    </Link>
  );
}

type LivePlan = {
  key: "free" | "starter" | "creator";
  name: string;
  price_monthly: number;
  processing_hours: number;
  export_quality: string;
  download_expiry_hours: number;
  features: Record<string, boolean>;
  is_active?: boolean;
};

const fallbackPlans: LivePlan[] = [
  {
    key: "free",
    name: "Free",
    price_monthly: 0,
    processing_hours: 1,
    export_quality: "720p",
    download_expiry_hours: 24,
    features: { basic_clipping: true, zip_download: true },
    is_active: true,
  },
  {
    key: "starter",
    name: "Starter",
    price_monthly: 299,
    processing_hours: 10,
    export_quality: "720p",
    download_expiry_hours: 24,
    features: { basic_clipping: true, zip_download: true },
    is_active: true,
  },
  {
    key: "creator",
    name: "Creator",
    price_monthly: 999,
    processing_hours: 50,
    export_quality: "1080p",
    download_expiry_hours: 48,
    features: { custom_watermark: true, title_overlay: true, outro: true, zip_download: true },
    is_active: true,
  },
];

function planBadge(planKey: string) {
  if (planKey === "creator") return "Most Popular";
  if (planKey === "starter") return "Best Start";
  return "Trial";
}

function planBestFor(planKey: string) {
  if (planKey === "creator") return "Branding + agency workflows";
  if (planKey === "starter") return "More reels + regular usage";
  return "Testing video to reels";
}

function planCta(planKey: string) {
  if (planKey === "creator") return "Subscribe Creator";
  if (planKey === "starter") return "Choose Starter";
  return "Start Free";
}

function planFeatureLines(plan: LivePlan) {
  if (plan.key === "creator") {
    return [
      `${plan.processing_hours} processing hours/month`,
      `${plan.export_quality} export`,
      "Title overlay",
      "Text watermark",
      "Logo / Image overlay",
      "Outro / end screen",
      "Bulk brand reels",
    ];
  }

  if (plan.key === "starter") {
    return [
      `${plan.processing_hours} processing hours/month`,
      `${plan.export_quality} export`,
      "YouTube reel generation",
      "ZIP export",
      "Good for regular creators",
      "Title overlay not included",
    ];
  }

  return [
    `${plan.processing_hours} processing hour/month`,
    `${plan.export_quality} export`,
    "YouTube URL clipping",
    "ZIP download",
    "Basic processing",
    "Logo / Outro not included",
  ];
}

function formatPlanPrice(plan: LivePlan) {
  return plan.price_monthly === 0 ? "₹0" : `₹${plan.price_monthly}`;
}


export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [livePlans, setLivePlans] = useState<LivePlan[]>(fallbackPlans);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const token = getToken();

    async function verifyLoggedInUser() {
      if (!token) {
        setIsLoggedIn(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        setIsLoggedIn(res.ok);
      } catch {
        setIsLoggedIn(false);
      }
    }

    async function loadPublicPlans() {
      try {
        const res = await fetch(`${API_URL}/billing/public-plans`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && Array.isArray(data.data)) {
          setLivePlans(data.data.filter((plan: LivePlan) => plan.is_active !== false));
        }
      } catch {
        setLivePlans(fallbackPlans);
      }
    }

    verifyLoggedInUser();
    loadPublicPlans();
  }, []);

  useEffect(() => {
    function handleScroll() {
      setShowBackToTop(window.scrollY > 600);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function planCheckoutHref(planKey: "free" | "starter" | "creator") {
    if (planKey === "free") {
      return isLoggedIn ? "/dashboard/pricing?plan=free&checkout=1" : "/signup?plan=free";
    }

    // Public home page paid-plan flow:
    // Home → Signup/Login → OTP → Checkout page → Razorpay/Stripe.
    // Razorpay is default on checkout; Stripe remains available as a secondary option.
    return isLoggedIn
      ? `/checkout?plan=${planKey}&autostart=1`
      : `/signup?plan=${planKey}&checkout=1`;
  }

  const plans = livePlans.length ? livePlans : fallbackPlans;

  const features = [
    ["🎬", "Video to Reel Converter", "YouTube video ko multiple short reels me convert karo."],
    ["🧠", "AI Clip Workflow", "Long video se reel-ready segments create karne ka workflow."],
    ["📝", "Title Overlay", "Har reel par bold caption/title add karo."],
    ["💧", "Watermark", "Brand name, handle ya website watermark lagao."],
    ["🖼️", "Logo/Image Overlay", "Logo, icon ya custom image video ke upar render karo."],
    ["🎞️", "Outro Screen", "Har reel ke end me image/video outro add karo."],
    ["📦", "ZIP Download", "All generated reels ek ZIP package me download karo."],
    ["⚡", "Multi-stage Queue", "Download → Clips → Branding → ZIP stage-based processing."],
  ];

  const audience = ["YouTubers", "Podcasters", "Coaches", "Course Creators", "News Channels", "Cricket Channels", "Agencies", "Social Media Managers"];

  const faqs = [
    ["Can I convert YouTube videos into reels?", "Yes. YouTube link paste karo, clip duration choose karo aur reels generate karo."],
    ["Can I add my logo and watermark?", "Creator plan me title overlay, text watermark, logo/image overlay aur outro add kar sakte ho."],
    ["Will I get all reels in one ZIP?", "Yes. Final generated clips ZIP file me ready milenge."],
    ["Can I bulk brand already-created reels?", "Yes. Bulk Brand Reels page par reels upload karke branding apply kar sakte ho."],
  ];

  const socialLinks = [
    {
      label: "Instagram",
      href: "#",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      ),
    },
    {
      label: "YouTube",
      href: "#",
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M21.6 7.2s-.2-1.5-.8-2.1c-.8-.8-1.7-.8-2.1-.9C15.8 4 12 4 12 4s-3.8 0-6.7.2c-.4.1-1.3.1-2.1.9-.6.6-.8 2.1-.8 2.1S2.2 9 2.2 10.8v1.7c0 1.8.2 3.6.2 3.6s.2 1.5.8 2.1c.8.8 1.9.8 2.4.9 1.7.2 6.4.2 6.4.2s3.8 0 6.7-.2c.4-.1 1.3-.1 2.1-.9.6-.6.8-2.1.8-2.1s.2-1.8.2-3.6v-1.7c0-1.8-.2-3.6-.2-3.6ZM10.1 14.7V8.5l5.9 3.1-5.9 3.1Z" />
        </svg>
      ),
    },
    {
      label: "X",
      href: "#",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-5-7.4L5.4 22H2.3l7.3-8.4L1.9 2h6.5l4.5 6.7L18.9 2Zm-1.1 17.9h1.7L7.5 4H5.7l12.1 15.9Z" />
        </svg>
      ),
    },
    {
      label: "LinkedIn",
      href: "#",
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4v12H3v-12Zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6v6.4h-4v-5.7c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3v5.8h-4v-12Z" />
        </svg>
      ),
    },
  ];


  return (
    <main className="min-h-screen overflow-hidden bg-[#EEF4FF] text-slate-950">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] text-white">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-[30rem] w-[30rem] rounded-full bg-[#0633AD]/40 blur-3xl" />

        <header className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-lg font-black text-[#2563EB] shadow-sm">
              CF
            </div>
            <div>
              <p className="text-xl font-black tracking-tight">ClipForge</p>
              <p className="text-xs font-semibold text-blue-100">Video to Reel + Branding</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-3 md:flex">
            {isLoggedIn ? (
              <Link href="/dashboard" className="rounded-2xl bg-white px-5 py-2.5 text-sm font-black text-[#2563EB] shadow-sm hover:bg-blue-50">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-2xl px-4 py-2.5 text-sm font-black text-white/90 hover:bg-white/10">
                  Login
                </Link>
                <Link href="/signup" className="rounded-2xl bg-white px-5 py-2.5 text-sm font-black text-[#2563EB] shadow-sm hover:bg-blue-50">
                  Start Free
                </Link>
              </>
            )}
          </nav>
        </header>

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1fr_0.95fr] lg:px-8 lg:pb-28 lg:pt-16">
          <div className="flex flex-col justify-center">
            <p className="w-fit rounded-full bg-white/15 px-4 py-2 text-sm font-bold ring-1 ring-white/20">
              YouTube Video → Multiple Branded Reels → ZIP
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
              Convert any YouTube video into multiple branded reels in minutes.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-blue-50 sm:text-lg">
              Paste a YouTube link. ClipForge creates reels, applies title, watermark, logo and outro, then gives you a ready-to-download ZIP.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={isLoggedIn ? "/dashboard" : "/signup"}
                className="rounded-2xl bg-white px-7 py-4 text-center font-black text-[#2563EB] shadow-xl hover:bg-blue-50"
              >
                {isLoggedIn ? "Go to Dashboard" : "Start Free"}
              </Link>
              <Link href="#pricing" className="rounded-2xl bg-white/15 px-7 py-4 text-center font-black text-white ring-1 ring-white/20 hover:bg-white/20">
                View Plans
              </Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-white/12 p-4 ring-1 ring-white/15">
                <p className="text-2xl font-black">12+</p>
                <p className="text-xs font-semibold text-blue-100">Reels from one video</p>
              </div>
              <div className="rounded-3xl bg-white/12 p-4 ring-1 ring-white/15">
                <p className="text-2xl font-black">4</p>
                <p className="text-xs font-semibold text-blue-100">Branding options</p>
              </div>
              <div className="rounded-3xl bg-white/12 p-4 ring-1 ring-white/15">
                <p className="text-2xl font-black">ZIP</p>
                <p className="text-xs font-semibold text-blue-100">Final export</p>
              </div>
            </div>
          </div>

          <div className="relative min-h-[560px]">
            <div className="absolute left-1/2 top-1/2 h-[500px] w-[330px] -translate-x-1/2 -translate-y-1/2 rotate-[-6deg] rounded-[2.4rem] bg-slate-950 p-4 shadow-2xl ring-8 ring-white/20">
              <div className="h-full overflow-hidden rounded-[1.9rem] bg-gradient-to-b from-slate-900 to-slate-950 p-4">
                <div className="mx-auto mb-4 h-1.5 w-20 rounded-full bg-white/20" />
                <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                  <p className="text-xs font-bold text-blue-200">3D Processing Preview</p>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-white p-3 text-slate-950">
                      <p className="text-xs font-black text-slate-500">INPUT</p>
                      <p className="mt-1 font-black">45 min YouTube Video</p>
                    </div>
                    <div className="mx-auto h-5 w-1 rounded-full bg-[#06B6D4]" />
                    <div className="rounded-2xl bg-[#2563EB] p-3 text-white">
                      <p className="text-xs font-black text-blue-100">AI CLIPPING</p>
                      <p className="mt-1 font-black">12 Reels Generated</p>
                    </div>
                    <div className="mx-auto h-5 w-1 rounded-full bg-[#06B6D4]" />
                    <div className="rounded-2xl bg-white p-3 text-slate-950">
                      <p className="text-xs font-black text-slate-500">BRANDING</p>
                      <p className="mt-1 font-black">Title + Watermark + Logo + Outro</p>
                    </div>
                    <div className="mx-auto h-5 w-1 rounded-full bg-[#06B6D4]" />
                    <div className="rounded-2xl bg-[#22C55E] p-3 text-white">
                      <p className="text-xs font-black text-green-100">OUTPUT</p>
                      <p className="mt-1 font-black">Final ZIP Ready</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <PipelineNode className="left-0 top-8 rotate-[-8deg]" step="1" title="YouTube Link" helper="Paste video URL" />
            <PipelineNode className="right-0 top-24 rotate-[7deg]" step="2" title="Reels Generated" helper="Auto clip output" />
            <PipelineNode className="bottom-28 left-0 rotate-[6deg]" step="3" title="Branding Applied" helper="Title, logo, outro" />
            <PipelineNode className="bottom-10 right-4 rotate-[-6deg]" step="4" title="ZIP Ready" helper="Download package" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] border border-blue-200 bg-white shadow-lg ring-1 ring-blue-100">
          <div className="bg-gradient-to-r from-[#2563EB] via-[#3B82F6] to-[#06B6D4] px-6 py-5 text-white sm:px-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">Acquisition Demo</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight">Live Demo Environment Notice</h3>
          </div>

          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-sm leading-7 text-slate-700">
                This public demo is being showcased for acquisition and evaluation purposes. Core features including
                YouTube video processing, reel generation workflow, branding tools, dashboard, subscriptions, user
                management, project workflows, ZIP exports and admin controls are implemented in the product.
              </p>

              <p className="mt-3 text-sm leading-7 text-slate-700">
                Email OTP delivery and live payment completion may be limited in this public demo because third-party
                providers require domain, sender, KYC and payment gateway verification. These integrations are already
                built into the system and can be connected to the buyer&apos;s own verified Email and Payment accounts.
              </p>

              <div className="mt-5 rounded-2xl bg-[#EEF4FF] p-4 text-sm leading-6 text-slate-700 ring-1 ring-blue-100">
                <p className="font-black text-slate-950">Important for buyers</p>
                <p className="mt-1">
                  This deployment is intended for product review. Production use requires connecting verified provider
                  accounts such as Email API, Razorpay/Stripe and approved business/domain settings.
                </p>
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white shadow-xl">
              <p className="text-sm font-black text-[#06B6D4]">Demo Login Credentials</p>

              <div className="mt-4 space-y-4 text-sm">
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                  <p className="font-black text-white">Admin Demo Access</p>
                  <p className="mt-2 text-slate-300"><span className="font-bold text-white">Email:</span> meriask.com@gmail.com</p>
                  <p className="text-slate-300"><span className="font-bold text-white">Password:</span> asdfgh</p>
                  <p className="mt-2 text-xs text-slate-400">After login, open /admin to review admin panel.</p>
                </div>

                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                  <p className="font-black text-white">User Demo Access</p>
                  <p className="mt-2 text-slate-300"><span className="font-bold text-white">Email:</span> bhaktikichhaya@gmail.com</p>
                  <p className="text-slate-300"><span className="font-bold text-white">Password:</span> asdfgh</p>
                  <p className="mt-2 text-xs text-slate-400">Temporary public credentials for evaluation only.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <SectionTitle
          eyebrow="How it works"
          title="From one long video to branded reels."
          description="Simple 3-step workflow: link paste karo, branding choose karo, aur final ZIP download karo."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            ["01", "Paste YouTube Link", "Video URL add karo aur clip duration/output ratio select karo."],
            ["02", "Add Branding", "Title overlay, watermark, logo/image aur outro optional add karo."],
            ["03", "Download ZIP", "Processing complete hone ke baad final branded reels ZIP me milenge."],
          ].map(([num, title, desc]) => (
            <div key={num} className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563EB] font-black text-white">{num}</div>
              <h3 className="mt-5 text-xl font-black">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
        <SectionTitle
          eyebrow="Pricing plans"
          title="Simple, transparent pricing for creators."
          description="Ye pricing admin panel se live update hoti hai. Admin price/hours badlega to homepage par bhi same dikhega."
        />

        <div className="mt-10 grid gap-5 xl:grid-cols-[1fr_1fr_1fr_1.05fr]">
          {plans.map((plan) => {
            const isCreator = plan.key === "creator";
            const isStarter = plan.key === "starter";

            return (
              <div
                key={plan.key}
                className={`relative rounded-[2rem] bg-white p-6 shadow-sm ring-1 transition hover:-translate-y-1 hover:shadow-xl ${
                  isCreator ? "ring-2 ring-[#2563EB] shadow-xl" : isStarter ? "ring-[#06B6D4]/40" : "ring-slate-200"
                }`}
              >
                {isCreator && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#2563EB] px-4 py-2 text-xs font-black text-white shadow-lg">
                    Most Popular
                  </div>
                )}

                <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
                  isCreator
                    ? "bg-[#2563EB] text-white ring-[#2563EB]"
                    : "bg-[#EEF4FF] text-[#2563EB] ring-[#2563EB]/10"
                }`}>
                  {planBadge(plan.key)}
                </span>

                <h3 className="mt-5 text-2xl font-black">{plan.name}</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">{planBestFor(plan.key)}</p>

                <div className="mt-6 flex items-end gap-2">
                  <p className="text-5xl font-black">{formatPlanPrice(plan)}</p>
                  {plan.price_monthly > 0 && <p className="pb-2 text-sm font-bold text-slate-500">/month</p>}
                </div>

                <div className="mt-6 rounded-2xl bg-[#EEF4FF] p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Processing</p>
                  <p className="mt-1 font-black">{plan.processing_hours} hours/month • {plan.export_quality}</p>
                </div>

                <div className="mt-6 space-y-3 text-sm font-semibold text-slate-700">
                  {planFeatureLines(plan).map((feature) => {
                    const negative = feature.includes("not included");
                    return (
                      <p key={feature} className={`flex gap-2 ${negative ? "text-slate-400" : ""}`}>
                        <span className={negative ? "" : "text-[#22C55E]"}>{negative ? "–" : "✓"}</span>
                        {feature}
                      </p>
                    );
                  })}
                </div>

                <Link
                  href={planCheckoutHref(plan.key)}
                  className={`mt-7 block rounded-2xl px-5 py-4 text-center text-sm font-black transition ${
                    isCreator ? "bg-[#2563EB] text-white hover:bg-[#0633AD]" : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  {planCta(plan.key)}
                </Link>
              </div>
            );
          })}

          <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl ring-1 ring-white/10">
            <p className="text-lg font-black">Compare Plans</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Live plan values admin panel se sync hote hain.</p>

            <div className="mt-6 space-y-4 text-sm">
              {[
                ["Processing Hours", `${plans.find((p) => p.key === "free")?.processing_hours ?? 1}`, `${plans.find((p) => p.key === "starter")?.processing_hours ?? 10}`, `${plans.find((p) => p.key === "creator")?.processing_hours ?? 50}`],
                ["Export Quality", plans.find((p) => p.key === "free")?.export_quality ?? "720p", plans.find((p) => p.key === "starter")?.export_quality ?? "720p", plans.find((p) => p.key === "creator")?.export_quality ?? "1080p"],
                ["ZIP Download", "✓", "✓", "✓"],
                ["Title Overlay", "×", "×", "✓"],
                ["Watermark", "×", "×", "✓"],
                ["Logo/Image Overlay", "×", "×", "✓"],
                ["Outro Screen", "×", "×", "✓"],
                ["Bulk Branding", "×", "×", "✓"],
              ].map(([feature, free, starter, creator]) => (
                <div key={feature} className="grid grid-cols-[1.35fr_0.55fr_0.65fr_0.65fr] items-center gap-2 border-b border-white/10 pb-3">
                  <p className="font-semibold text-slate-300">{feature}</p>
                  <p className="text-center font-black text-slate-400">{free}</p>
                  <p className="text-center font-black text-slate-400">{starter}</p>
                  <p className="text-center font-black text-[#22C55E]">{creator}</p>
                </div>
              ))}
            </div>

            <Link href="/dashboard/pricing" className="mt-6 block rounded-2xl bg-white px-5 py-4 text-center text-sm font-black text-slate-950 transition hover:bg-slate-100">
              Open Full Pricing
            </Link>
          </div>
        </div>
      </section>


<section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
        <SectionTitle
          eyebrow="Features"
          title="A reel generator with built-in branding."
          description="Sirf video cut nahi — final clips par brand identity bhi apply karo."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {features.map(([icon, title, desc]) => (
            <div key={title} className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-xl">
              <p className="text-3xl">{icon}</p>
              <h3 className="mt-4 text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8 lg:p-10">
          <SectionTitle
            eyebrow="Before vs After"
            title="One long video becomes a branded reel package."
            description="Original video ko short clips, branding aur ZIP export me convert karo."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-4">
            {[
              ["Before", "45 Minute Video", "Long YouTube content"],
              ["Step 1", "12 Reels", "Short clips generated"],
              ["Step 2", "Branding", "Title + watermark + logo + outro"],
              ["After", "ZIP Ready", "Final reels package"],
            ].map(([label, title, desc]) => (
              <div key={label} className="rounded-3xl bg-[#EEF4FF] p-5">
                <p className="text-xs font-black uppercase tracking-wide text-[#2563EB]">{label}</p>
                <h3 className="mt-3 text-xl font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
        <SectionTitle
          eyebrow="Perfect for"
          title="Built for creators, channels and agencies."
          description="Jo bhi long-form content se reels banana chahte hain, unke liye ClipForge useful hai."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {audience.map((item) => (
            <div key={item} className="rounded-3xl bg-white p-5 text-center font-black shadow-sm ring-1 ring-slate-200">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
        <SectionTitle
          eyebrow="FAQ"
          title="Common questions"
          description="Video to reel conversion aur branding ke baare me quick answers."
        />
        <div className="mt-10 space-y-4">
          {faqs.map(([q, a]) => (
            <div key={q} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-black">{q}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
            <div>
              <p className="text-sm font-black text-[#06B6D4]">Ready to create branded reels?</p>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl">Turn your next YouTube video into a reel package.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                Free plan se start karo. Creator plan me branding tools unlock karo.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Link href={isLoggedIn ? "/dashboard" : "/signup"} className="rounded-2xl bg-white px-6 py-4 text-center font-black text-slate-950 hover:bg-slate-100">
                {isLoggedIn ? "Open Dashboard" : "Create Account"}
              </Link>
              <Link href="#pricing" className="rounded-2xl bg-white/10 px-6 py-4 text-center font-black text-white ring-1 ring-white/15 hover:bg-white/15">
                View Plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-black text-[#2563EB]">
                CF
              </div>
              <div>
                <p className="text-lg font-black">ClipForge</p>
                <p className="text-xs font-semibold text-slate-400">Video to Reel + Branding</p>
              </div>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
              Convert YouTube videos into branded reels with title, watermark, logo, outro and ZIP export.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {socialLinks.map((social) => (
                <SocialIcon key={social.label} label={social.label} href={social.href}>
                  {social.icon}
                </SocialIcon>
              ))}
            </div>
          </div>

          <div>
            <p className="font-black">Product</p>
            <div className="mt-4 space-y-3 text-sm font-semibold text-slate-400">
              {isLoggedIn ? (
                <Link href="/dashboard" className="block hover:text-white">Dashboard</Link>
              ) : (
                <>
                  <Link href="/signup" className="block hover:text-white">Start Free</Link>
                  <Link href="/login" className="block hover:text-white">Login</Link>
                </>
              )}
              <Link href="/dashboard/pricing" className="block hover:text-white">Pricing</Link>
              <Link href="/dashboard/create" className="block hover:text-white">Create Project</Link>
            </div>
          </div>

          <div>
            <p className="font-black">legal page's</p>
            <div className="mt-4 space-y-3 text-sm font-semibold text-slate-400">
              <Link href="/contact" className="block hover:text-white">Contact</Link>
              <Link href="/privacy" className="block hover:text-white">Privacy Policy</Link>
              <Link href="/terms" className="block hover:text-white">Terms & Conditions</Link>
              <Link href="/refund" className="block hover:text-white">Refund Policy</Link>
            </div>
          </div>

          <div>
            <p className="font-black">Support</p>
            <div className="mt-4 space-y-3 text-sm font-semibold text-slate-400">
              <Link href="/disclaimer" className="block hover:text-white">Disclaimer</Link>
              <Link href="/dashboard" className="block hover:text-white">Dashboard</Link>
              <p>support@clipforge.local</p>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-6 text-sm font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ClipForge. All rights reserved.</p>
          <p>Built for creators, channels and agencies.</p>
        </div>
      </footer>

      {showBackToTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white shadow-2xl ring-1 ring-white/20 transition hover:-translate-y-1 hover:bg-[#2563EB] focus:outline-none focus:ring-4 focus:ring-[#2563EB]/30"
        >
          ↑
        </button>
      )}

    </main>
  );
}
