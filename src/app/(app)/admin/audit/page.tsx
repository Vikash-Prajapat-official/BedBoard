import Link from "next/link";
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
export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(["ADMIN"]);
  const sp = await searchParams;
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
  const fmt = new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "medium" });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Audit log ({data.total})</h1>
      <form method="get" className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-5 sm:items-end">
        <Field label="Action">
          <Select name="action" defaultValue={sp.action ?? ""}><option value="">All</option>{data.actions.map((a) => <option key={a}>{a}</option>)}</Select>
        </Field>
        <Field label="Who">
          <Select name="actor" defaultValue={sp.actor ?? ""}><option value="">Everyone</option>{data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        </Field>
        <Field label="From"><Input type="date" name="from" defaultValue={from ?? ""} /></Field>
        <Field label="To"><Input type="date" name="to" defaultValue={to ?? ""} /></Field>
        <Button type="submit">Filter</Button>
      </form>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {data.rows.length === 0 ? <p className="text-sm text-slate-600">Nothing matches.</p> : (
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-600"><th className="p-1">When</th><th className="p-1">Who</th><th className="p-1">Action</th><th className="p-1">What</th><th className="p-1">From</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="whitespace-nowrap p-1">{fmt.format(new Date(r.at))}</td>
                    <td className="p-1">{r.actor}</td>
                    <td className="p-1 font-medium">{r.action}</td>
                    <td className="p-1">{r.what}</td>
                    <td className="p-1 text-slate-600">{r.ip ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <nav className="flex items-center gap-3 text-sm" aria-label="Pages">
        {data.page > 1 ? <Link className="text-blue-700 underline" href={qs(data.page - 1)}>← Newer</Link> : <span className="text-slate-400">← Newer</span>}
        <span>Page {data.page} of {data.pages}</span>
        {data.page < data.pages ? <Link className="text-blue-700 underline" href={qs(data.page + 1)}>Older →</Link> : <span className="text-slate-400">Older →</span>}
      </nav>
    </div>
  );
}
