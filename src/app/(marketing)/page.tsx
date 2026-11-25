import { BedDouble, CalendarClock, ClipboardCheck, FileBarChart, Globe, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { WardDemo } from "@/components/landing/ward-demo";

export const dynamic = "force-dynamic";

const btn = "inline-flex min-h-12 items-center justify-center rounded-lg px-6 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700";

function Cmd({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-sm text-slate-50"><code>{children}</code></pre>
  );
}

export default async function Home() {
  const t = await getTranslations("landing");
  const ts = await getTranslations("discharges");
  const tw = await getTranslations("ward.checklist");
  const repo = process.env.REPO_URL?.startsWith("http") ? process.env.REPO_URL : null;
  const contact = process.env.CONTACT_EMAIL?.includes("@") ? process.env.CONTACT_EMAIL : null;

  const features = [
    { k: "wardMap", Icon: BedDouble },
    { k: "findBed", Icon: CalendarClock },
    { k: "tracker", Icon: ClipboardCheck },
    { k: "housekeeping", Icon: Sparkles },
    { k: "reports", Icon: FileBarChart },
    { k: "public", Icon: Globe },
  ] as const;
  const steps = ["s1", "s2", "s3"] as const;
  const faqs = ["1", "2", "3", "4"] as const;

  return (
    <div className="bg-white text-slate-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">{t("skip")}</a>

      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-3 p-4">
          <span className="text-xl font-bold text-blue-700">BedBoard</span>
          <span className="ml-auto"><LocaleSwitcher /></span>
          <Link href="/login" className="rounded-md border border-blue-700 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">{t("login")}</Link>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="bg-gradient-to-b from-blue-50 to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2">
            <div className="space-y-6">
              <h1 className="text-4xl font-extrabold tracking-tight text-blue-700 sm:text-5xl">{t("hero.title")}</h1>
              <p className="text-lg text-slate-700">{t("hero.sub")}</p>
              <div className="flex flex-wrap gap-3">
                <a href="#demo" className={`${btn} border-2 border-blue-700 text-blue-700 hover:bg-blue-50`}>{t("hero.demo")}</a>
                <a href="#install" className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}>{t("hero.install")}</a>
              </div>
            </div>
            <div id="demo" className="scroll-mt-6"><WardDemo /></div>
          </div>
        </section>

        {/* The problem */}
        <section className="mx-auto max-w-6xl space-y-6 px-4 py-14">
          <h2 className="max-w-3xl text-3xl font-bold">{t("problem.title")}</h2>
          <p className="max-w-3xl text-slate-700">{t("problem.text")}</p>
          <figure className="max-w-3xl rounded-xl border-l-8 border-red-700 bg-red-50 p-6">
            <blockquote className="text-2xl font-semibold text-red-900">{t("problem.quote")}</blockquote>
            <p className="mt-3 text-slate-800">{t("problem.quoteContext")}</p>
            <figcaption className="mt-3 text-sm">
              <a className="font-medium text-blue-700 underline" href="https://caravanmagazine.in/health/mumbai-hospitals-turn-away-covid-suspects" rel="noopener noreferrer" target="_blank">{t("problem.source")}</a>
            </figcaption>
          </figure>
        </section>

        {/* How it works */}
        <section className="bg-slate-50">
          <div className="mx-auto max-w-6xl space-y-8 px-4 py-14">
            <h2 className="text-3xl font-bold">{t("how.title")}</h2>
            <ol className="grid gap-4 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s} className="rounded-xl border bg-white p-6 shadow-sm">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-lg font-bold text-white" aria-hidden>{i + 1}</span>
                  <h3 className="text-lg font-semibold">{t(`how.${s}.title`)}</h3>
                  <p className="mt-1 text-slate-700">{t(`how.${s}.text`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Discharge */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold">{t("discharge.title")}</h2>
            <p className="text-slate-700">{t("discharge.text")}</p>
          </div>
          <figure className="space-y-2 rounded-xl border-2 border-red-600 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <strong>{t("discharge.sampleBed")}</strong>
              <span className="ml-auto text-sm font-bold text-red-800">{ts("overdue")} · {t("discharge.sampleWait")}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded border border-slate-300 px-2 py-1 font-medium">{ts("steps", { done: 2, total: 4 })}</span>
              <span className="rounded border border-green-600 bg-green-100 px-2 py-1 text-green-900"><span aria-hidden>✔</span> {tw("order")}</span>
              <span className="rounded border border-green-600 bg-green-100 px-2 py-1 text-green-900"><span aria-hidden>✔</span> {ts("summary")} · {ts("done")}</span>
              <span className="rounded border border-slate-400 px-2 py-1"><span aria-hidden>○</span> {ts("bill")} · {ts("pending")}</span>
              <span className="rounded border border-slate-400 px-2 py-1"><span aria-hidden>○</span> {ts("meds")} · {ts("pending")}</span>
            </div>
            <figcaption className="text-xs text-slate-600">{t("discharge.sampleNote")}</figcaption>
          </figure>
        </section>

        {/* Features */}
        <section className="bg-slate-50">
          <div className="mx-auto max-w-6xl space-y-8 px-4 py-14">
            <h2 className="text-3xl font-bold">{t("features.title")}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ k, Icon }) => (
                <li key={k} className="rounded-xl border bg-white p-6 shadow-sm">
                  <Icon className="mb-3 text-blue-700" size={28} aria-hidden />
                  <h3 className="text-lg font-semibold">{t(`features.${k}.title`)}</h3>
                  <p className="mt-1 text-slate-700">{t(`features.${k}.text`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Privacy */}
        <section className="mx-auto max-w-6xl space-y-4 px-4 py-14">
          <h2 className="max-w-3xl text-3xl font-bold">{t("privacy.title")}</h2>
          <ul className="list-disc space-y-1 pl-6 text-slate-700">
            {(["p1", "p2", "p3", "p4"] as const).map((p) => <li key={p}>{t(`privacy.${p}`)}</li>)}
          </ul>
        </section>

        {/* Install */}
        <section id="install" className="scroll-mt-4 bg-blue-700 text-white">
          <div className="mx-auto max-w-4xl space-y-5 px-4 py-14">
            <h2 className="text-3xl font-bold">{t("install.title")}</h2>
            <p className="text-blue-50">{t("install.intro")}</p>
            <ol className="space-y-4">
              <li><p className="mb-1 font-medium">1. {t("install.s1")}</p><Cmd>cp .env.example .env</Cmd></li>
              <li><p className="mb-1 font-medium">2. {t("install.s2")}</p><Cmd>docker compose up -d --build</Cmd></li>
              <li><p className="mb-1 font-medium">3. {t("install.s3")}</p><Cmd>http://localhost:3001</Cmd></li>
            </ol>
            <p className="text-sm text-blue-50">{t("install.demoNote")}</p>
            <Cmd>docker compose exec app npx prisma db seed</Cmd>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-4xl space-y-4 px-4 py-14">
          <h2 className="text-3xl font-bold">{t("faq.title")}</h2>
          <dl className="space-y-4">
            {faqs.map((n) => (
              <div key={n} className="rounded-xl border bg-white p-5 shadow-sm">
                <dt className="font-semibold">{t(`faq.q${n}`)}</dt>
                <dd className="mt-1 text-slate-700">{t(`faq.a${n}`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 p-6 text-sm text-slate-700">
          <span className="font-bold text-blue-700">BedBoard</span>
          <span>{t("footer.license")}</span>
          {repo && <a className="font-medium text-blue-700 underline" href={repo} rel="noopener noreferrer">{t("footer.github")}</a>}
          {contact && <a className="font-medium text-blue-700 underline" href={`mailto:${contact}`}>{t("footer.contact")}: {contact}</a>}
        </div>
      </footer>
    </div>
  );
}
