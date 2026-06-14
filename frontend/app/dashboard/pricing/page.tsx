"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch, clearToken, getCurrentUser, getToken } from "../../../lib/auth";

type Plan = {
  key: string;
  name: string;
  price_monthly: number;
  processing_hours: number;
  export_quality: string;
  download_expiry_hours: number;
  features: Record<string, boolean>;
};

type BillingOverview = {
  current_plan: Plan;
  plans: Plan[];
  usage: {
    used_hhmmss: string;
    limit_hhmmss: string;
    remaining_hhmmss: string;
  };
};

function getErrorMessage(data: any): string {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  return "Something went wrong.";
}

function planTone(planKey: string): string {
  if (planKey === "creator") return "ring-[#2563EB] shadow-xl scale-[1.01]";
  if (planKey === "starter") return "ring-[#06B6D4]/40";
  return "ring-slate-200";
}

function planBadge(planKey: string): string {
  if (planKey === "creator") return "Most Popular";
  if (planKey === "starter") return "Best Start";
  return "Trial";
}

function featureText(key: string): string {
  const map: Record<string, string> = {
    custom_watermark: "Creator branding",
    outro: "Outro / end screen",
    bulk_branding: "Bulk brand reels",
    priority_queue: "Priority processing",
    hd_export: "HD export",
  };
  return map[key] || key.replaceAll("_", " ");
}

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoCheckoutRef = useRef(false);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [error, setError] = useState("");
  const [changingPlan, setChangingPlan] = useState("");
  const [paymentMode, setPaymentMode] = useState("");

  async function loadBilling() {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    try {
      const user = await getCurrentUser();
      if (!user?.is_email_verified) {
        const next = window.location.pathname + window.location.search;
        router.push(`/verify-email?next=${encodeURIComponent(next)}`);
        return;
      }

      const res = await apiFetch("/billing/overview", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(getErrorMessage(data));
        return;
      }
      setOverview(data.data);
    } catch {
      clearToken();
      router.push("/login");
    }
  }

  useEffect(() => {
    loadBilling();
  }, []);

  useEffect(() => {
    const stripeSessionId = searchParams.get("stripe_session_id");
    const stripeCancelled = searchParams.get("stripe_cancelled");

    if (stripeCancelled === "1") {
      setError("Stripe payment cancelled.");
      return;
    }

    if (stripeSessionId) {
      verifyStripeCheckoutSession(stripeSessionId);
    }
  }, [searchParams]);


  useEffect(() => {
    if (!overview || autoCheckoutRef.current) return;

    const selectedPlan = searchParams.get("plan");
    const checkout = searchParams.get("checkout");
    const gateway = searchParams.get("gateway") || "razorpay";
    if (!selectedPlan || checkout !== "1") return;

    const plan = overview.plans.find((item) => item.key === selectedPlan);
    if (!plan || overview.current_plan.key === plan.key) return;

    autoCheckoutRef.current = true;

    if (gateway === "stripe") {
      buyWithStripe(plan);
      return;
    }

    buyWithRazorpay(plan);
  }, [overview, searchParams]);

  async function changePlan(planKey: string) {
    setError("");
    setChangingPlan(planKey);

    try {
      const res = await apiFetch("/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: planKey }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(getErrorMessage(data));
        return;
      }

      await loadBilling();
    } catch {
      setError("Backend connect nahi ho raha.");
    } finally {
      setChangingPlan("");
    }
  }

  async function buyWithRazorpay(plan: Plan) {
    if (plan.price_monthly === 0) {
      await changePlan(plan.key);
      return;
    }

    setError("");
    setPaymentMode(plan.key);

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        setError("Razorpay checkout load nahi hua. Internet connection check karo.");
        return;
      }

      const orderRes = await apiFetch("/billing/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: plan.key }),
      });
      const orderData = await orderRes.json().catch(() => null);

      if (!orderRes.ok || !orderData?.success) {
        setError(getErrorMessage(orderData));
        return;
      }

      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "ClipForge",
        description: `${plan.name} Plan`,
        order_id: orderData.order_id,
        prefill: {},
        handler: async function (response: any) {
          const verifyRes = await apiFetch("/billing/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plan_key: plan.key,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          const verifyData = await verifyRes.json().catch(() => null);

          if (!verifyRes.ok || !verifyData?.success) {
            setError(getErrorMessage(verifyData));
            return;
          }

          await loadBilling();
        },
        modal: {
          ondismiss: function () {
            setPaymentMode("");
          },
        },
        theme: {
          color: "#2563EB",
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch {
      setError("Payment start nahi hua. Backend/Razorpay config check karo.");
    } finally {
      setPaymentMode("");
    }
  }

  async function buyWithStripe(plan: Plan) {
    if (plan.price_monthly === 0) {
      await changePlan(plan.key);
      return;
    }

    setError("");
    setPaymentMode(`stripe-${plan.key}`);

    try {
      const res = await apiFetch("/billing/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: plan.key }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.checkout_url) {
        setError(getErrorMessage(data));
        return;
      }

      window.location.href = data.checkout_url;
    } catch {
      setError("Stripe checkout start nahi hua. Backend/Stripe config check karo.");
    } finally {
      setPaymentMode("");
    }
  }

  async function verifyStripeCheckoutSession(sessionId: string) {
    setError("");
    setPaymentMode("stripe-verify");

    try {
      const res = await apiFetch("/billing/stripe/verify-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(getErrorMessage(data));
        return;
      }

      await loadBilling();
      router.replace("/dashboard/pricing");
    } catch {
      setError("Stripe payment verify nahi hua.");
    } finally {
      setPaymentMode("");
    }
  }

  return (
    <main className="min-h-screen bg-[#EEF4FF]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] p-5 text-white shadow-xl sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20">
                ClipForge Pricing
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Choose Your Plan
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
                Free se start karo, Starter se regular processing karo, aur Creator plan se branding tools unlock karo.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="rounded-2xl bg-white px-5 py-3.5 text-center text-sm font-black text-[#2563EB] shadow-sm transition hover:bg-blue-50"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {overview && (
          <div className="mt-6 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-500">Current Plan</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="text-2xl font-black text-slate-950">{overview.current_plan.name}</p>
                  <span className="rounded-full bg-[#2563EB]/10 px-3 py-1 text-xs font-black capitalize text-[#1D4ED8] ring-1 ring-[#2563EB]/20">
                    {overview.current_plan.key}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  Used {overview.usage.used_hhmmss} / {overview.usage.limit_hhmmss} • Remaining {overview.usage.remaining_hhmmss}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:w-[480px]">
                <div className="rounded-2xl bg-[#EEF4FF] p-4">
                  <p className="text-xs font-semibold text-slate-500">Hours</p>
                  <p className="mt-1 font-black text-slate-950">{overview.current_plan.processing_hours}h</p>
                </div>
                <div className="rounded-2xl bg-[#EEF4FF] p-4">
                  <p className="text-xs font-semibold text-slate-500">Quality</p>
                  <p className="mt-1 font-black text-slate-950">{overview.current_plan.export_quality}</p>
                </div>
                <div className="rounded-2xl bg-[#EEF4FF] p-4">
                  <p className="text-xs font-semibold text-slate-500">Expiry</p>
                  <p className="mt-1 font-black text-slate-950">{overview.current_plan.download_expiry_hours}h</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <div className="mt-6 rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">{error}</div>}

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {overview?.plans.map((plan) => {
            const isCurrent = overview.current_plan.key === plan.key;
            const isCreator = plan.key === "creator";
            const includedFeatures = Object.entries(plan.features || {}).filter(([, enabled]) => enabled);

            async function buyWithStripe(plan: Plan) {
    if (plan.price_monthly === 0) {
      await changePlan(plan.key);
      return;
    }

    setError("");
    setPaymentMode(`stripe-${plan.key}`);

    try {
      const res = await apiFetch("/billing/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: plan.key }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.checkout_url) {
        setError(getErrorMessage(data));
        return;
      }

      window.location.href = data.checkout_url;
    } catch {
      setError("Stripe checkout start nahi hua. Backend/Stripe config check karo.");
    } finally {
      setPaymentMode("");
    }
  }

  async function verifyStripeCheckoutSession(sessionId: string) {
    setError("");
    setPaymentMode("stripe-verify");

    try {
      const res = await apiFetch("/billing/stripe/verify-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(getErrorMessage(data));
        return;
      }

      await loadBilling();
      router.replace("/dashboard/pricing");
    } catch {
      setError("Stripe payment verify nahi hua.");
    } finally {
      setPaymentMode("");
    }
  }

  return (
              <div
                key={plan.key}
                className={`relative rounded-[2rem] bg-white p-5 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-xl sm:p-6 ${planTone(plan.key)}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${isCreator ? "bg-[#2563EB] text-white ring-[#2563EB]" : "bg-[#EEF4FF] text-[#2563EB] ring-[#2563EB]/10"}`}>
                      {planBadge(plan.key)}
                    </span>
                    <h2 className="mt-4 text-2xl font-black text-slate-950">{plan.name}</h2>
                    <p className="mt-2 text-sm font-semibold text-slate-500">
                      {plan.processing_hours} processing hours/month
                    </p>
                  </div>

                  {isCurrent && (
                    <span className="rounded-full bg-[#22C55E]/10 px-3 py-1 text-xs font-black text-[#15803D] ring-1 ring-[#22C55E]/20">
                      Current
                    </span>
                  )}
                </div>

                <div className="mt-6">
                  <p className="text-4xl font-black tracking-tight text-slate-950">
                    {plan.price_monthly === 0 ? "Free" : `₹${plan.price_monthly}`}
                  </p>
                  {plan.price_monthly > 0 && <p className="mt-1 text-sm font-bold text-slate-500">per month</p>}
                </div>

                <div className="mt-6 grid gap-3">
                  <div className="rounded-2xl bg-[#EEF4FF] p-4">
                    <p className="text-xs font-semibold text-slate-500">Export Quality</p>
                    <p className="mt-1 font-black text-slate-950">{plan.export_quality}</p>
                  </div>
                  <div className="rounded-2xl bg-[#EEF4FF] p-4">
                    <p className="text-xs font-semibold text-slate-500">Download Expiry</p>
                    <p className="mt-1 font-black text-slate-950">{plan.download_expiry_hours} hours</p>
                  </div>
                </div>

                <div className="mt-6 space-y-3 text-sm font-semibold text-slate-700">
                  <p className="flex gap-2"><span className="text-[#22C55E]">✓</span> YouTube URL clipping</p>
                  <p className="flex gap-2"><span className="text-[#22C55E]">✓</span> ZIP download</p>
                  <p className="flex gap-2"><span className="text-[#22C55E]">✓</span> Project dashboard</p>
                  {includedFeatures.map(([key]) => (
                    <p key={key} className="flex gap-2 capitalize">
                      <span className="text-[#22C55E]">✓</span> {featureText(key)}
                    </p>
                  ))}
                  {plan.key !== "creator" && (
                    <>
                      <p className="flex gap-2 text-slate-400"><span>–</span> Creator branding</p>
                      <p className="flex gap-2 text-slate-400"><span>–</span> Outro/end screen</p>
                    </>
                  )}
                </div>

                <button
                  onClick={() => buyWithRazorpay(plan)}
                  disabled={isCurrent || Boolean(changingPlan) || Boolean(paymentMode)}
                  className={`mt-7 w-full rounded-2xl px-5 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isCreator
                      ? "bg-[#2563EB] text-white hover:bg-[#0633AD]"
                      : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  {isCurrent
                    ? "Current Plan"
                    : paymentMode === plan.key || changingPlan === plan.key
                      ? "Processing..."
                      : plan.price_monthly === 0
                        ? `Choose ${plan.name}`
                        : `Pay with Razorpay`}
                </button>

                {!isCurrent && plan.price_monthly > 0 && (
                  <button
                    onClick={() => buyWithStripe(plan)}
                    disabled={Boolean(changingPlan) || Boolean(paymentMode)}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {paymentMode === `stripe-${plan.key}` || paymentMode === "stripe-verify"
                      ? "Stripe Processing..."
                      : "Pay with Stripe"}
                  </button>
                )}
              </div>
            );
          })}

          {!overview && (
            <div className="rounded-[2rem] bg-white p-8 text-center text-slate-500 shadow-sm ring-1 ring-slate-200 lg:col-span-3">
              Loading pricing plans...
            </div>
          )}
        </div>

        <div className="mt-8 rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <p className="text-sm font-black text-[#06B6D4]">Secure Payment</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Paid plans Razorpay ya Stripe checkout se activate hote hain.</p>
            </div>
            <div>
              <p className="text-sm font-black text-[#06B6D4]">Usage Tracking</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Dashboard par used, limit aur remaining hours clearly dikhte hain.</p>
            </div>
            <div>
              <p className="text-sm font-black text-[#06B6D4]">Creator Tools</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Watermark, title overlay, image overlay aur outro Creator plan me unlock hote hain.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
