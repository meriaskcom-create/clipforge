import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#EEF4FF] text-slate-950">
      <section className="bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="text-sm font-black text-blue-50 hover:text-white">← Back to Home</Link>
          <p className="mt-8 inline-flex rounded-full bg-white/15 px-4 py-2 text-sm font-bold ring-1 ring-white/20">
            Contact
          </p>
          <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">Contact ClipForge</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-blue-50 sm:text-base">
            Support, billing, product feedback ya business query ke liye contact details yahan add kar sakte ho.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <h2 className="text-2xl font-black">Support</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              App setup, payment, processing, ZIP download ya account issue ke liye support team se contact karein.
            </p>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-[#EEF4FF] p-4">
                <p className="text-xs font-black uppercase text-slate-500">Email</p>
                <p className="mt-1 font-black">support@clipforge.local</p>
              </div>
              <div className="rounded-2xl bg-[#EEF4FF] p-4">
                <p className="text-xs font-black uppercase text-slate-500">Response</p>
                <p className="mt-1 font-black">Business hours</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm sm:p-8">
            <h2 className="text-2xl font-black">Before Launch</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Yahan apna real support email, WhatsApp, business address aur company details add karna.
            </p>
            <Link href="/dashboard" className="mt-6 inline-block rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950">
              Open Dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
