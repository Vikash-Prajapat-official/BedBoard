import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getPublicAvailability, isPublicPageEnabled } from "@/lib/public-availability";

export const dynamic = "force-dynamic";

// Numbers only, no login. Cached for 60 seconds. Does not exist unless PUBLIC_PAGE_ENABLED=true.
export default async function PublicPage() {
  if (!isPublicPageEnabled()) notFound();
  const [t, tb, locale, data] = await Promise.all([getTranslations("public"), getTranslations("bedType"), getLocale(), getPublicAvailability()]);
  const time = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { timeStyle: "short", timeZone: data.timeZone }).format(new Date(data.updatedAt));

  const rows = [{ key: "all", label: t("all"), free: data.free, total: data.total }, ...data.types.map((x) => ({ key: x.type, label: tb(x.type as never), free: x.free, total: x.total }))];

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-blue-700">{data.hospitalName ?? "BedBoard"}</h1>
        <span className="ml-auto"><LocaleSwitcher /></span>
      </header>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} className={`flex items-baseline gap-3 rounded-xl border bg-white p-4 shadow-sm ${i === 0 ? "border-blue-700" : ""}`}>
            <span className="flex-1 font-medium">{r.label}</span>
            <span className="text-3xl font-bold text-blue-700">{r.free}</span>
            <span className="text-sm text-slate-700">{t("free")} · {t("ofTotal", { n: r.total })}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-700">{t("updated", { time })}. {t("note")}</p>
      <p className="text-sm text-slate-700">{t("numbersOnly")}</p>
    </main>
  );
}
