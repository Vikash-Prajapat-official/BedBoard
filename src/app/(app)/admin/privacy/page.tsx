import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/current-user";
import { getEnv } from "@/lib/env";
import { PrivacyManager } from "./privacy-manager";

export const dynamic = "force-dynamic";

// Shows patient names, so it is admin only. Every correction and erasure is audit-logged.
export default async function PrivacyPage() {
  await requireUser(["ADMIN"]);
  const t = await getTranslations("privacy");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <Link href="/admin/privacy/notice" className="ml-auto text-sm text-blue-700 underline">{t("noticeLink")}</Link>
      </div>
      <p className="max-w-3xl text-sm text-slate-700">{t("intro")}</p>
      <p className="max-w-3xl text-sm text-slate-700">{t("retentionNote", { days: getEnv().RETENTION_DAYS })}</p>
      <PrivacyManager />
    </div>
  );
}
