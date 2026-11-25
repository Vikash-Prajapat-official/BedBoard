import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/current-user";
import { getDashboard } from "@/lib/dashboard";
import { LiveRefresh } from "@/components/live-refresh";
import { FullscreenButton } from "@/components/fullscreen-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Counts only, never patient names (SPEC section 8). Updates live over SSE.
export default async function DashboardPage() {
  const user = await requireUser();
  const d = await getDashboard();
  const t = await getTranslations("dashboard");
  const tb = await getTranslations("bedType");
  const canOpen = ["NURSE", "DESK", "DOCTOR", "ADMIN"].includes(user.role);
  const link = "text-blue-700 underline";

  const c = d.totals;
  const totals = [
    { l: t("freeBeds"), v: c.free, n: t("ofTotal", { n: c.total }) },
    { l: t("occupancy"), v: c.occupancyPct === null ? "–" : `${c.occupancyPct}%`, n: t("occupiedCount", { n: c.occupied }) },
    { l: t("dischargesToday"), v: c.dischargesToday, n: t("expected") },
    { l: t("beingCleaned"), v: c.cleaning, n: t("notReady") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t("title", { hospital: d.hospitalName ?? t("hospitalFallback") })}</h1>
        <span className="ml-auto flex items-center gap-2">
          <LiveRefresh />
          <FullscreenButton />
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals.map((i) => (
          <div key={i.l} className="rounded-xl border bg-white p-4 shadow-sm">
            <dt className="text-sm text-slate-700">{i.l}</dt>
            <dd className="text-3xl font-bold text-blue-700">{i.v}</dd>
            <dd className="text-xs text-slate-700">{i.n}</dd>
          </div>
        ))}
      </dl>

      {d.wards.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-700">
            {t("noWards")}{" "}
            {user.role === "ADMIN"
              ? t.rich("noWardsAdmin", {
                  w: (x) => <Link className={link} href="/admin/wards">{x}</Link>,
                  b: (x) => <Link className={link} href="/admin/beds">{x}</Link>,
                  s: (x) => <Link className={link} href="/admin/users">{x}</Link>,
                })
              : t("noWardsOther")}
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
                    <span className="text-sm font-normal text-slate-700">{w.occupancyPct === null ? "–" : t("pctFull", { pct: w.occupancyPct })}</span>
                  </CardTitle>
                  <div className="h-2 w-full overflow-hidden rounded bg-slate-200" aria-hidden>
                    <div className="h-full bg-blue-700" style={{ width: `${w.occupancyPct ?? 0}%` }} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-lg"><strong>{w.free}</strong> {t("freeWord")} <span className="text-sm text-slate-700">{t("ofBeds", { n: w.total })}</span></p>
                  {w.types.length > 0 && (
                    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
                      {w.types.map((x) => <li key={x.type}>{tb(x.type as never)} {x.free}/{x.total}</li>)}
                    </ul>
                  )}
                  <p className="text-slate-700">
                    {t("dischargesLine", { count: w.dischargesToday })} · {t("cleaningN", { n: w.cleaning })}
                    {w.reserved ? ` · ${t("reservedN", { n: w.reserved })}` : ""}
                    {w.blocked ? ` · ${t("blockedN", { n: w.blocked })}` : ""}
                  </p>
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
