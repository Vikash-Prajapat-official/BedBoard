import { requireUser } from "@/lib/current-user";
import { getCensusHistory, getLosReport, getOccupancyReport, getTurnoverReport, resolveRange } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const fmt = (n: number | null, unit = "") => (n === null ? "–" : `${n}${unit}`);
const days = (h: number | null) => (h === null ? "–" : h >= 48 ? `${Math.round((h / 24) * 10) / 10} days` : `${h} h`);

// Numbers only: no patient names anywhere on this page.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const resolved = await resolveRange({ from: sp.from, to: sp.to });

  const form = (from: string, to: string) => (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <Field label="From"><Input type="date" name="from" defaultValue={from} required /></Field>
      <Field label="To"><Input type="date" name="to" defaultValue={to} required /></Field>
      <Button type="submit">Show</Button>
    </form>
  );

  if (!resolved.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Reports</h1>
        {form(sp.from ?? "", sp.to ?? "")}
        <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">{resolved.message}</p>
      </div>
    );
  }
  const r = resolved.range;
  const [occ, los, turn, census] = await Promise.all([getOccupancyReport(r), getLosReport(r), getTurnoverReport(r), getCensusHistory(r)]);
  const q = `from=${r.from}&to=${r.to}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Reports</h1>
        <span className="ml-auto flex gap-2 text-sm">
          <a className="text-blue-700 underline" href={`/api/export/admissions.csv?${q}`}>Download admissions (CSV)</a>
          <a className="text-blue-700 underline" href={`/api/export/census.csv?${q}`}>Download census (CSV)</a>
        </span>
      </div>
      {form(r.from, r.to)}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: "Average occupancy", v: fmt(occ.averageOccupancyPct, "%"), n: `${occ.daysWithData} day${occ.daysWithData === 1 ? "" : "s"} of census` },
          { l: "Average stay", v: days(los.overall.avgLosHours), n: `${los.overall.discharges} patients left` },
          { l: "Order to patient left", v: days(los.overall.avgOrderToLeftHours), n: "discharge order given → left" },
          { l: "Bed turnover", v: fmt(turn.overall.turnoverPerBed), n: `discharges per bed · cleaning ${fmt(turn.overall.avgCleaningMinutes, " min")}` },
        ].map((t) => (
          <div key={t.l} className="rounded-xl border bg-white p-4 shadow-sm">
            <dt className="text-sm text-slate-600">{t.l}</dt>
            <dd className="text-3xl font-bold text-blue-700">{t.v}</dd>
            <dd className="text-xs text-slate-600">{t.n}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader><CardTitle>Occupancy by day</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {occ.days.length === 0 ? (
            <p className="text-sm text-slate-600">No midnight census in this range yet. One is saved every night at 00:00.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-600"><th className="p-1">Date</th><th className="p-1">Occupied</th><th className="p-1">Free</th><th className="p-1">Blocked</th><th className="p-1">Total</th><th className="w-1/3 p-1">Occupancy</th></tr></thead>
              <tbody>
                {occ.days.map((d) => (
                  <tr key={d.date} className="border-t">
                    <td className="p-1">{d.date}</td><td className="p-1">{d.occupied}</td><td className="p-1">{d.free}</td><td className="p-1">{d.blocked}</td><td className="p-1">{d.total}</td>
                    <td className="p-1">
                      <span className="flex items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded bg-slate-200" aria-hidden><span className="block h-full bg-blue-700" style={{ width: `${d.occupancyPct ?? 0}%` }} /></span>
                        <strong className="w-12 text-right">{fmt(d.occupancyPct, "%")}</strong>
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
        <CardHeader><CardTitle>By ward</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-slate-600"><th className="p-1">Ward</th><th className="p-1">Avg occupancy</th><th className="p-1">Patients left</th><th className="p-1">Avg stay</th><th className="p-1">Order → left</th><th className="p-1">Turnover / bed</th><th className="p-1">Avg cleaning</th></tr></thead>
            <tbody>
              {turn.wards.map((t) => {
                const l = los.wards.find((x) => x.wardId === t.wardId);
                const o = occ.wards.find((x) => x.wardId === t.wardId);
                return (
                  <tr key={t.wardId} className="border-t">
                    <td className="p-1 font-medium">{t.name}</td>
                    <td className="p-1">{fmt(o?.averageOccupancyPct ?? null, "%")}</td>
                    <td className="p-1">{t.discharges}</td>
                    <td className="p-1">{days(l?.avgLosHours ?? null)}</td>
                    <td className="p-1">{days(l?.avgOrderToLeftHours ?? null)}</td>
                    <td className="p-1">{fmt(t.turnoverPerBed)}</td>
                    <td className="p-1">{fmt(t.avgCleaningMinutes, " min")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-600">
            Outcomes: {Object.entries(los.outcomes).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ")}. A patient moved between wards counts in the ward they left from.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Census history ({census.length} rows)</CardTitle></CardHeader>
        <CardContent className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white"><tr className="text-slate-600"><th className="p-1">Date</th><th className="p-1">Ward</th><th className="p-1">Type</th><th className="p-1">Total</th><th className="p-1">Occupied</th><th className="p-1">Free</th><th className="p-1">Blocked</th></tr></thead>
            <tbody>
              {census.slice(0, 400).map((c, i) => (
                <tr key={i} className="border-t"><td className="p-1">{c.date}</td><td className="p-1">{c.ward}</td><td className="p-1">{c.bedType.toLowerCase()}</td><td className="p-1">{c.total}</td><td className="p-1">{c.occupied}</td><td className="p-1">{c.free}</td><td className="p-1">{c.blocked}</td></tr>
              ))}
            </tbody>
          </table>
          {census.length > 400 && <p className="mt-2 text-xs text-slate-600">Showing the latest 400 rows. The CSV has all of them.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
