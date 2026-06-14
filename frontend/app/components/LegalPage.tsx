import Link from "next/link";

type Section = {
  title: string;
  body: string;
};

function LegalPage({
  eyebrow,
  title,
  description,
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections: Section[];
}) {
  return (
    <main className="min-h-screen bg-[#EEF4FF] text-slate-950">
      <section className="bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#06B6D4] px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="text-sm font-black text-blue-50 hover:text-white">← Back to Home</Link>
          <p className="mt-8 inline-flex rounded-full bg-white/15 px-4 py-2 text-sm font-bold ring-1 ring-white/20">
            {eyebrow}
          </p>
          <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-blue-50 sm:text-base">{description}</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <p className="rounded-2xl bg-[#EEF4FF] p-4 text-sm font-semibold leading-6 text-slate-600">
            Note: Ye template general product/legal information ke liye hai. Launch se pehle apne business details, jurisdiction aur legal advisor ke hisab se final review kar lena.
          </p>

          <div className="mt-8 space-y-6">
            {sections.map((section) => (
              <div key={section.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <h2 className="text-xl font-black">{section.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{section.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/contact" className="rounded-2xl bg-[#2563EB] px-5 py-3 text-center text-sm font-black text-white hover:bg-[#0633AD]">
              Contact Support
            </Link>
            <Link href="/" className="rounded-2xl border border-slate-200 px-5 py-3 text-center text-sm font-black text-slate-950 hover:bg-slate-50">
              Back Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default LegalPage;
