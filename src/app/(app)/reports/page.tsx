import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/current-user";
import { MAX_RANGE_DAYS, getCensusHistory, getLosReport, getOccupancyReport, getTurnoverReport, resolveRange } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Numbers only: no patient names anywhere on this page.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser(["ADMIN"]);
  const [t, tb, to, tt, sp] = await Promise.all([getTranslations("reports"), getTranslations("bedType"), getTranslations("outcome"), getTranslations("time"), searchParams]);
  const resolved = await resolveRange({ from: sp.from, to: sp.to });

  const pct = (n: number | null) => (n === null ? "–" : `${n}%`);
  const num = (n: number | null) => (n === null ? "–" : String(n));
  const mins = (n: number | null) => (n === null ? "–" : tt("min", { n }));
  const span = (h: number | null) => (h === null ? "–" : h >= 48 ? tt("days", { d: Math.round((h / 24) * 10) / 10 }) : tt("hours", { h }));

  const form = (from: string, toDate: string) => (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <Field label={t("from")}><Input type="date" name="from" defaultValue={from} required /></Field>
      <Field label={t("to")}><Input type="date" name="to" defaultValue={toDate} required /></Field>
      <Button type="submit">{t("show")}</Button>
    </form>
  );

  if (!resolved.ok) {
    const msg = resolved.code === "DATES" ? t("errDates") : resolved.code === "ORDER" ? t("errOrder") : t("errLong", { n: MAX_RANGE_DAYS });
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        {form(sp.from ?? "", sp.to ?? "")}
        <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">{msg}</p>
      </div>
    );
  }
  const r = resolved.range;
  const [occ, los, turn, census] = await Promise.all([getOccupancyReport(r), getLosReport(r), getTurnoverReport(r), getCensusHistory(r)]);
  const q = `from=${r.from}&to=${r.to}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <span className="ml-auto flex gap-3 text-sm">
          <a className="text-blue-700 underline" href={`/api/export/admissions.csv?${q}`}>{t("downloadAdmissions")}</a>
          <a className="text-blue-700 underline" href={`/api/export/census.csv?${q}`}>{t("downloadCensus")}</a>
        </span>
      </div>
      {form(r.from, r.to)}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: t("avgOccupancy"), v: pct(occ.averageOccupancyPct), n: t("censusDays", { count: occ.daysWithData }) },
          { l: t("avgStay"), v: span(los.overall.avgLosHours), n: t("patientsLeft", { count: los.overall.discharges }) },
          { l: t("orderToLeft"), v: span(los.overall.avgOrderToLeftHours), n: t("orderToLeftNote") },
          { l: t("turnover"), v: num(turn.overall.turnoverPerBed), n: t("turnoverNote", { min: mins(turn.overall.avgCleaningMinutes) }) },
        ].map((x) => (
          <div key={x.l} className="rounded-xl border bg-white p-4 shadow-sm">
            <dt className="text-sm text-slate-700">{x.l}</dt>
            <dd className="text-3xl font-bold text-blue-700">{x.v}</dd>
            <dd className="text-xs text-slate-700">{x.n}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader><CardTitle>{t("occupancyByDay")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {occ.days.length === 0 ? (
            <p className="text-sm text-slate-700">{t("noCensus")}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-700"><th className="p-1">{t("colDate")}</th><th className="p-1">{t("colOccupied")}</th><th className="p-1">{t("colFree")}</th><th className="p-1">{t("colBlocked")}</th><th className="p-1">{t("colTotal")}</th><th className="w-1/3 p-1">{t("colOccupancy")}</th></tr></thead>
              <tbody>
                {occ.days.map((d) => (
                  <tr key={d.date} className="border-t">
                    <td className="p-1">{d.date}</td><td className="p-1">{d.occupied}</td><td className="p-1">{d.free}</td><td className="p-1">{d.blocked}</td><td className="p-1">{d.total}</td>
                    <td className="p-1">
                      <span className="flex items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded bg-slate-200" aria-hidden><span className="block h-full bg-blue-700" style={{ width: `${d.occupancyPct ?? 0}%` }} /></span>
                        <strong className="w-12 text-right">{pct(d.occupancyPct)}</strong>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("byWard")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-slate-700"><th className="p-1">{t("colWard")}</th><th className="p-1">{t("colAvgOcc")}</th><th className="p-1">{t("colLeft")}</th><th className="p-1">{t("colStay")}</th><th className="p-1">{t("colOrderLeft")}</th><th className="p-1">{t("colTurnover")}</th><th className="p-1">{t("colCleaning")}</th></tr></thead>
            <tbody>
              {turn.wards.map((w) => {
                const l = los.wards.find((x) => x.wardId === w.wardId);
                const o = occ.wards.find((x) => x.wardId === w.wardId);
                return (
                  <tr key={w.wardId} className="border-t">
                    <td className="p-1 font-medium">{w.name}</td>
                    <td className="p-1">{pct(o?.averageOccupancyPct ?? null)}</td>
                    <td className="p-1">{w.discharges}</td>
                    <td className="p-1">{span(l?.avgLosHours ?? null)}</td>
                    <td className="p-1">{span(l?.avgOrderToLeftHours ?? null)}</td>
                    <td className="p-1">{num(w.turnoverPerBed)}</td>
                    <td className="p-1">{mins(w.avgCleaningMinutes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-700">
            {t("outcomesLine", { list: Object.entries(los.outcomes).map(([k, v]) => `${to(k as never)} ${v}`).join(" · ") })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("censusHistory", { n: census.length })}</CardTitle></CardHeader>
        <CardContent className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white"><tr className="text-slate-700"><th className="p-1">{t("colDate")}</th><th className="p-1">{t("colWard")}</th><th className="p-1">{t("colType")}</th><th className="p-1">{t("colTotal")}</th><th className="p-1">{t("colOccupied")}</th><th className="p-1">{t("colFree")}</th><th className="p-1">{t("colBlocked")}</th></tr></thead>
            <tbody>
              {census.slice(0, 400).map((c, i) => (
                <tr key={i} className="border-t"><td className="p-1">{c.date}</td><td className="p-1">{c.ward}</td><td className="p-1">{tb(c.bedType as never)}</td><td className="p-1">{c.total}</td><td className="p-1">{c.occupied}</td><td className="p-1">{c.free}</td><td className="p-1">{c.blocked}</td></tr>
              ))}
            </tbody>
          </table>
          {census.length > 400 && <p className="mt-2 text-xs text-slate-700">{t("showingLatest")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
