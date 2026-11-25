import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/current-user";
import { getAuditPage } from "@/lib/audit-query";
import { startOfLocalDate } from "@/lib/stats";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type SP = { page?: string; action?: string; actor?: string; from?: string; to?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Every bed change, login and admin action. Holds ids and labels, never patient names.
// Action codes (bed_admit, login, ...) are a technical record and stay in English in every language.
export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(["ADMIN"]);
  const [t, tr, locale, sp] = await Promise.all([getTranslations("admin.audit"), getTranslations("role"), getLocale(), searchParams]);
  const tz = (await db.hospital.findFirst({ select: { timezone: true } }))?.timezone ?? "Asia/Kolkata";
  const from = DATE.test(sp.from ?? "") ? sp.from! : undefined;
  const to = DATE.test(sp.to ?? "") ? sp.to! : undefined;
  const nextDay = to ? new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : undefined;

  const data = await getAuditPage({
    page: Number(sp.page) || 1,
    action: sp.action || undefined,
    actorId: sp.actor || undefined,
    from: from ? startOfLocalDate(from, tz) : undefined,
    to: nextDay ? startOfLocalDate(nextDay, tz) : undefined,
  });

  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ action: sp.action, actor: sp.actor, from, to })) if (v) p.set(k, v);
    p.set("page", String(page));
    return `?${p}`;
  };
  const fmt = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "medium" });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("title", { n: data.total })}</h1>
      <form method="get" className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-5 sm:items-end">
        <Field label={t("action")}>
          <Select name="action" defaultValue={sp.action ?? ""}><option value="">{t("everyone")}</option>{data.actions.map((a) => <option key={a}>{a}</option>)}</Select>
        </Field>
        <Field label={t("who")}>
          <Select name="actor" defaultValue={sp.actor ?? ""}><option value="">{t("everyone")}</option>{data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        </Field>
        <Field label={t("from")}><Input type="date" name="from" defaultValue={from ?? ""} /></Field>
        <Field label={t("to")}><Input type="date" name="to" defaultValue={to ?? ""} /></Field>
        <Button type="submit">{t("filter")}</Button>
      </form>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {data.rows.length === 0 ? <p className="text-sm text-slate-700">{t("none")}</p> : (
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-700"><th className="p-1">{t("colWhen")}</th><th className="p-1">{t("colWho")}</th><th className="p-1">{t("colAction")}</th><th className="p-1">{t("colWhat")}</th><th className="p-1">{t("colFrom")}</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="whitespace-nowrap p-1">{fmt.format(new Date(r.at))}</td>
                    <td className="p-1">{r.actor ? `${r.actor.name} (${tr(r.actor.role)})` : t("system")}</td>
                    <td className="p-1 font-medium" lang="en">{r.action}</td>
                    <td className="p-1">{r.what}</td>
                    <td className="p-1 text-slate-700">{r.ip ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <nav className="flex items-center gap-3 text-sm" aria-label="Pages">
        {data.page > 1 ? <Link className="text-blue-700 underline" href={qs(data.page - 1)}>{t("newer")}</Link> : <span className="text-slate-500">{t("newer")}</span>}
        <span>{t("page", { page: data.page, pages: data.pages })}</span>
        {data.page < data.pages ? <Link className="text-blue-700 underline" href={qs(data.page + 1)}>{t("older")}</Link> : <span className="text-slate-500">{t("older")}</span>}
      </nav>
    </div>
  );
}
