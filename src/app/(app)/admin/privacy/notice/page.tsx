import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/current-user";
import { getEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * A printable notice for the admission desk (SPEC section 8). It follows the language chosen in the
 * header, so print it once in English and once in Hindi. It is a template, not legal advice: have the
 * hospital's own legal adviser check it and fill in the contact person.
 */
export default async function NoticePage() {
  await requireUser(["ADMIN"]);
  const t = await getTranslations("notice");
  const hospital = (await db.hospital.findFirst({ select: { name: true } }))?.name ?? "";
  const days = getEnv().RETENTION_DAYS;
  const sections = [
    ["why", "whyText"],
    ["what", "whatText"],
    ["who", "whoText"],
    ["howLong", "howLongText"],
    ["rights", "rightsText"],
  ] as const;

  return (
    <article className="mx-auto max-w-2xl space-y-5 bg-white p-6 print:p-0">
      <div className="flex justify-end print:hidden"><PrintButton label={t("print")} /></div>
      <h1 className="text-2xl font-bold">{t("title", { hospital })}</h1>
      {sections.map(([h, p]) => (
        <section key={h} className="space-y-1">
          <h2 className="text-lg font-semibold">{t(h)}</h2>
          <p>{t(p, { days })}</p>
        </section>
      ))}
      <p className="pt-4">{t("contact")}</p>
    </article>
  );
}
