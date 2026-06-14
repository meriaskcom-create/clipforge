"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, clearToken, getCurrentUser, getToken } from "../../lib/auth";

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

type Gateway = "razorpay" | "stripe";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function getErrorMessage(data: any): string {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  return "Something went wrong.";
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

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoStartedRef = useRef(false);
  const planKey = searchParams.get("plan") || "starter";
  const autostart = searchParams.get("autostart") === "1";
  const gatewayFromUrl = searchParams.get("gateway") === "stripe" ? "stripe" : "razorpay";

  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<Gateway>(gatewayFromUrl);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paymentMode, setPaymentMode] = useState("");

  const selectedPlan = useMemo(() => {
    return overview?.plans.find((plan) => plan.key === planKey) || null;
  }, [overview, planKey]);

  const isCurrentPlan = Boolean(selectedPlan && overview?.current_plan.key === selectedPlan.key);
  const enabledFeatures = Object.entries(selectedPlan?.features || {}).filter(([, enabled]) => enabled);

  async function loadCheckout() {
    if (!getToken()) {
      router.push(`/login?next=${encodeURIComponent(`/checkout?plan=${planKey}&autostart=1`)}`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const user = await getCurrentUser();
      if (!user?.is_email_verified) {
        const next = `/checkout?plan=${encodeURIComponent(planKey)}&autostart=1${selectedGateway === "stripe" ? "&gateway=stripe" : ""}`;
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCheckout();
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
    if (!overview || !selectedPlan || !autostart || autoStartedRef.current) return;
    if (isCurrentPlan) return;

    autoStartedRef.current = true;
    startPayment(selectedGateway);
  }, [overview, selectedPlan, autostart, selectedGateway, isCurrentPlan]);

  async function activateFreePlan(plan: Plan) {
    setError("");
    setPaymentMode("free");

    try {
      const res = await apiFetch("/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: plan.key }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(getErrorMessage(data));
        return;
      }

      router.push("/dashboard/pricing");
    } catch {
      setError("Plan activate nahi hua. Backend connection check karo.");
    } finally {
      setPaymentMode("");
    }
  }

  async function startPayment(gateway: Gateway = selectedGateway) {
    if (!selectedPlan) {
      setError("Selected plan nahi mila. Please pricing page se plan dobara select karo.");
      return;
    }

    if (isCurrentPlan) {
      router.push("/dashboard/pricing");
      return;
    }

    if (selectedPlan.price_monthly === 0) {
      await activateFreePlan(selectedPlan);
      return;
    }

    if (gateway === "stripe") {
      await buyWithStripe(selectedPlan);
      return;
    }

    await buyWithRazorpay(selectedPlan);
  }

  async function buyWithRazorpay(plan: Plan) {
    setError("");
    setPaymentMode("razorpay");

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

      const razorpay = new window.Razorpay({
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "ClipForge",
        description: `${plan.name} Plan`,
        order_id: orderData.order_id,
        prefill: {},
        handler: async function (response: any) {
          setPaymentMode("razorpay-verify");

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
            setPaymentMode("");
            return;
          }

          router.push("/dashboard/pricing?payment=success");
        },
        modal: {
          ondismiss: function () {
            setPaymentMode("");
            autoStartedRef.current = true;
          },
        },
        theme: {
          color: "#2563EB",
        },
      });

      razorpay.open();
    } catch {
      setError("Payment start nahi hua. Backend/Razorpay config check karo.");
      setPaymentMode("");
    }
  }

  async function buyWithStripe(plan: Plan) {
    setError("");
    setPaymentMode("stripe");

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

      router.replace("/dashboard/pricing?payment=success");
    } catch {
      setError("Stripe payment verify nahi hua.");
    } finally {
      setPaymentMode("");
    }
  }

  return (
    <main className="min-h-screen bg-[#EEF4FF] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563EB] text-lg font-black text-white shadow-sm">
              CF
            </div>
            <div>
              <p className="text-xl font-black tracking-tight">ClipForge</p>
              <p className="text-xs font-semibold text-slate-500">Secure Checkout</p>
            </div>
          </Link>

          <Link href="/dashboard/pricing" className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-[#2563EB] ring-1 ring-slate-200 transition hover:bg-blue-50">
            Change Plan
          </Link>
        </div>

        <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200">
          <div className="bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] p-6 text-white sm:p-8">
            <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black ring-1 ring-white/20">
              Checkout
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Complete your subscription</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-blue-50">
              Razorpay default selected hai. International users Stripe choose kar sakte hain.
            </p>
          </div>

          {loading && (
            <div className="p-8 text-center text-sm font-bold text-slate-500">Loading checkout...</div>
          )}

          {!loading && !selectedPlan && (
            <div className="p-8">
              <div className="rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">
                Selected plan nahi mila. Pricing page se plan dobara choose karo.
              </div>
            </div>
          )}

          {!loading && selectedPlan && (
            <div className="grid gap-0 lg:grid-cols-[1fr_0.85fr]">
              <section className="p-6 sm:p-8">
                <p className="text-sm font-bold text-slate-500">Selected Plan</p>
                <div className="mt-4 rounded-[1.5rem] bg-[#EEF4FF] p-5 ring-1 ring-[#2563EB]/10">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-slate-950">{selectedPlan.name}</h2>
                      <p className="mt-2 text-sm font-semibold text-slate-600">
                        {selectedPlan.processing_hours} processing hours/month • {selectedPlan.export_quality} export
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-3xl font-black text-slate-950">
                        {selectedPlan.price_monthly === 0 ? "Free" : `₹${selectedPlan.price_monthly}`}
                      </p>
                      {selectedPlan.price_monthly > 0 && <p className="text-xs font-bold text-slate-500">per month</p>}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm font-semibold text-slate-700 sm:grid-cols-2">
                    <p>✓ YouTube URL clipping</p>
                    <p>✓ ZIP download</p>
                    <p>✓ Project dashboard</p>
                    <p>✓ {selectedPlan.download_expiry_hours}h download expiry</p>
                    {enabledFeatures.slice(0, 4).map(([key]) => (
                      <p key={key} className="capitalize">✓ {featureText(key)}</p>
                    ))}
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-bold text-slate-800">Payment Method</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setSelectedGateway("razorpay")}
                      className={`rounded-2xl border p-4 text-left transition ${selectedGateway === "razorpay" ? "border-[#2563EB] bg-[#2563EB]/5 ring-4 ring-[#2563EB]/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-slate-950">Razorpay</p>
                        <span className="rounded-full bg-[#22C55E]/10 px-2.5 py-1 text-[11px] font-black text-[#15803D]">Default</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">India cards, UPI, netbanking aur wallets ke liye.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedGateway("stripe")}
                      className={`rounded-2xl border p-4 text-left transition ${selectedGateway === "stripe" ? "border-[#2563EB] bg-[#2563EB]/5 ring-4 ring-[#2563EB]/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-slate-950">Stripe</p>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">International</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">International cards aur supported countries ke liye.</p>
                    </button>
                  </div>
                </div>
              </section>

              <aside className="border-t border-slate-200 bg-slate-50 p-6 sm:p-8 lg:border-l lg:border-t-0">
                <div className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <p className="text-sm font-bold text-slate-500">Order Summary</p>
                  <div className="mt-5 space-y-4 text-sm font-semibold text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>{selectedPlan.name} Plan</span>
                      <span className="font-black text-slate-950">{selectedPlan.price_monthly === 0 ? "₹0" : `₹${selectedPlan.price_monthly}`}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Billing</span>
                      <span className="font-black text-slate-950">Monthly</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Gateway</span>
                      <span className="font-black capitalize text-slate-950">{selectedGateway}</span>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <div className="flex items-end justify-between gap-3">
                      <span className="text-sm font-bold text-slate-500">Total</span>
                      <span className="text-3xl font-black text-slate-950">{selectedPlan.price_monthly === 0 ? "₹0" : `₹${selectedPlan.price_monthly}`}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => startPayment()}
                    disabled={isCurrentPlan || Boolean(paymentMode)}
                    className="mt-6 w-full rounded-2xl bg-[#2563EB] px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-[#0633AD] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCurrentPlan
                      ? "Already Current Plan"
                      : paymentMode
                        ? "Processing..."
                        : selectedPlan.price_monthly === 0
                          ? "Activate Free Plan"
                          : selectedGateway === "stripe"
                            ? "Continue with Stripe"
                            : "Continue with Razorpay"}
                  </button>

                  {error && <div className="mt-4 rounded-2xl bg-[#EF4444]/10 p-4 text-sm font-bold text-[#B91C1C]">{error}</div>}

                  <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">
                    Payment complete hote hi plan automatically activate ho jayega.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback=<main className="min-h-screen bg-[#EEF4FF] px-4 py-8 text-slate-950">Loading...</main>>
      <CheckoutContent />
    </Suspense>
  );
}
