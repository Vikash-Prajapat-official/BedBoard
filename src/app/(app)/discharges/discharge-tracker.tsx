"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { callApi, safeRefresh } from "@/lib/client-api";
import { formatMinutes } from "@/lib/duration";
import { checklistProgress, isOverdue, waitingMinutes } from "@/lib/stats";
import type { DischargeRow } from "@/lib/bed-queries";

const STEPS = [
  { step: "summary", key: "summaryReadyAt" },
  { step: "bill", key: "billClearedAt" },
  { step: "meds", key: "medsGivenAt" },
] as const;

export function DischargeTracker({ rows, canAct, alertHours }: { rows: DischargeRow[]; canAct: boolean; alertHours: number }) {
  const t = useTranslations("discharges");
  const tx = useTranslations("sex");
  const tt = useTranslations("time");
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setNow(new Date());
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);

  async function post(r: DischargeRow, body: Record<string, unknown>) {
    setBusy(r.admissionId);
    setError("");
    const res = await callApi(`/api/admissions/${r.admissionId}/discharge-step`, "POST", body, { queue: t("queue", { ward: r.bed.wardName, bed: r.bed.label }) });
    setBusy(null);
    setConfirming(null);
    if (!res.ok) setError(res.message);
    void safeRefresh(router);
  }

  if (rows.length === 0) return <p className="rounded-xl border bg-white p-6 text-center text-slate-700">{t("none")}</p>;

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">{error}</p>}
      <p className="text-sm text-slate-700">{t("note", { hours: alertHours })}</p>
      <ol className="space-y-2">
        {rows.map((r) => {
          const prog = checklistProgress({
            dischargeOrderAt: new Date(r.dischargeOrderAt),
            summaryReadyAt: r.summaryReadyAt ? new Date(r.summaryReadyAt) : null,
            billClearedAt: r.billClearedAt ? new Date(r.billClearedAt) : null,
            medsGivenAt: r.medsGivenAt ? new Date(r.medsGivenAt) : null,
          });
          const overdue = now ? isOverdue(new Date(r.dischargeOrderAt), now, alertHours) : false;
          const waited = now ? waitingMinutes(new Date(r.dischargeOrderAt), now) : null;
          const allDone = prog.done === prog.total;
          return (
            <li key={r.admissionId} className={`space-y-2 rounded-xl border-2 bg-white p-3 ${overdue ? "border-red-600" : "border-amber-500"}`}>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <strong>{r.bed.wardName} · {r.bed.label}</strong>
                <span className="text-sm">{r.patient.name}, {r.patient.age} {tx(r.patient.sex as never)}</span>
                <span className={`ml-auto text-sm font-medium ${overdue ? "font-bold text-red-800" : "text-slate-700"}`}>
                  {overdue ? `${t("overdue")} · ` : ""}{waited !== null ? t("waiting", { time: formatMinutes(waited, tt) }) : ""}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-slate-300 px-2 py-1 text-xs font-medium">{t("steps", { done: prog.done, total: prog.total })}</span>
                <span className="rounded border border-green-600 bg-green-100 px-2 py-1 text-xs"><span aria-hidden>✔</span> {t("orderGiven")}</span>
                {STEPS.map((s) => {
                  const at = r[s.key];
                  return canAct ? (
                    <Button key={s.step} variant="outline" className="min-h-9" disabled={busy === r.admissionId} onClick={() => post(r, { step: s.step, done: !at })}>
                      <span aria-hidden>{at ? "✔" : "○"}</span> {t(s.step)}<span className="sr-only"> {at ? t("srDone") : t("srNotDone")}</span>
                    </Button>
                  ) : (
                    <span key={s.step} className={`rounded border px-2 py-1 text-xs ${at ? "border-green-600 bg-green-100" : "border-slate-300"}`}>
                      <span aria-hidden>{at ? "✔" : "○"}</span> {t(s.step)} {at ? t("done") : t("pending")}
                    </span>
                  );
                })}
                {canAct && (
                  <span className="ml-auto">
                    {confirming === r.admissionId ? (
                      <span className="flex gap-2">
                        <Button disabled={busy === r.admissionId} onClick={() => post(r, { step: "left", version: r.bed.version })}>{t("confirmLeft")}</Button>
                        <Button variant="outline" onClick={() => setConfirming(null)}>{t("cancel")}</Button>
                      </span>
                    ) : (
                      <Button variant={allDone ? "default" : "outline"} onClick={() => setConfirming(r.admissionId)}>{t("left")}</Button>
                    )}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
