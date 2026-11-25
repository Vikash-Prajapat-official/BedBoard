"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/lib/constants";
import { safeRefresh } from "@/lib/client-api";

export function LocaleSwitcher() {
  const t = useTranslations("language");
  const current = useLocale();
  const router = useRouter();

  function choose(l: Locale) {
    if (l === current) return;
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    void safeRefresh(router);
  }

  return (
    <div role="group" aria-label={t("label")} className="inline-flex overflow-hidden rounded-md border border-slate-300 text-sm">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === current}
          onClick={() => choose(l)}
          className={`min-h-9 px-3 ${l === current ? "bg-blue-700 font-medium text-white" : "bg-white text-slate-800 hover:bg-slate-100"}`}
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
