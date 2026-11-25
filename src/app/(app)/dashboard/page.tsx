import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { getDashboard, type Counts } from "@/lib/dashboard";
import { LiveRefresh } from "@/components/live-refresh";
import { FullscreenButton } from "@/components/fullscreen-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Counts only, never patient names (SPEC section 8). Updates live over SSE.
export default async function DashboardPage() {
  const user = await requireUser();
  const d = await getDashboard();
  const canOpen = ["NURSE", "DESK", "DOCTOR", "ADMIN"].includes(user.role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{d.hospitalName ?? "Hospital"} · beds now</h1>
        <span className="ml-auto flex items-center gap-2">
          <LiveRefresh />
          <FullscreenButton />
        </span>
      </div>

      <Totals c={d.totals} />

      {d.wards.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-700">
            No wards yet.{" "}
            {user.role === "ADMIN" ? (
              <>Set up your <Link className="text-blue-700 underline" href="/admin/wards">wards</Link>, <Link className="text-blue-700 underline" href="/admin/beds">beds</Link> and <Link className="text-blue-700 underline" href="/admin/users">staff</Link>.</>
            ) : "Ask an administrator to add them."}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.wards.map((w) => {
            const body = (
              <Card className={`h-full ${canOpen ? "hover:border-blue-700" : ""}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-baseline justify-between gap-2">
                    {w.name}
                    <span className="text-sm font-normal text-slate-600">{w.occupancyPct === null ? "–" : `${w.occupancyPct}%`} full</span>
                  </CardTitle>
                  <Bar pct={w.occupancyPct} />
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-lg"><strong>{w.free}</strong> free <span className="text-sm text-slate-600">of {w.total} beds</span></p>
                  {w.types.length > 0 && (
                    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
                      {w.types.map((t) => <li key={t.type}>{t.type.toLowerCase()} {t.free}/{t.total}</li>)}
                    </ul>
                  )}
                  <p className="text-slate-700">{w.dischargesToday} discharge{w.dischargesToday === 1 ? "" : "s"} today · {w.cleaning} cleaning{w.reserved ? ` · ${w.reserved} reserved` : ""}{w.blocked ? ` · ${w.blocked} blocked` : ""}</p>
                </CardContent>
              </Card>
            );
            return <li key={w.id}>{canOpen ? <Link href={`/wards/${w.id}`}>{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

function Bar({ pct }: { pct: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-slate-200" aria-hidden>
      <div className="h-full bg-blue-700" style={{ width: `${pct ?? 0}%` }} />
    </div>
  );
}

function Totals({ c }: { c: Counts }) {
  const items = [
    { label: "Free beds", value: c.free, note: `of ${c.total}` },
    { label: "Occupancy", value: c.occupancyPct === null ? "–" : `${c.occupancyPct}%`, note: `${c.occupied} occupied` },
    { label: "Discharges today", value: c.dischargesToday, note: "expected" },
    { label: "Being cleaned", value: c.cleaning, note: "not yet ready" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border bg-white p-4 shadow-sm">
          <dt className="text-sm text-slate-600">{i.label}</dt>
          <dd className="text-3xl font-bold text-blue-700">{i.value}</dd>
          <dd className="text-xs text-slate-600">{i.note}</dd>
        </div>
      ))}
    </dl>
  );
}
