"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/client-api";
import { checklistProgress, isOverdue, waitingMinutes } from "@/lib/stats";
import type { DischargeRow } from "@/lib/bed-queries";

const STEPS = [
  { step: "summary", key: "summaryReadyAt", label: "Summary" },
  { step: "bill", key: "billClearedAt", label: "Bill" },
  { step: "meds", key: "medsGivenAt", label: "Medicines" },
] as const;

const fmt = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

export function DischargeTracker({ rows, canAct, alertHours }: { rows: DischargeRow[]; canAct: boolean; alertHours: number }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function post(r: DischargeRow, body: Record<string, unknown>) {
    setBusy(r.admissionId);
    setError("");
    const res = await callApi(`/api/admissions/${r.admissionId}/discharge-step`, "POST", body);
    setBusy(null);
    setConfirming(null);
    if (!res.ok) setError(res.message);
    router.refresh();
  }

  if (rows.length === 0) return <p className="rounded-xl border bg-white p-6 text-center text-slate-700">No discharge orders waiting.</p>;

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">{error}</p>}
      <p className="text-sm text-slate-600">Longest waiting first. Turns red after {alertHours} hours.</p>
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
                <span className="text-sm">{r.patient.name}, {r.patient.age}{r.patient.sex[0]}</span>
                <span className={`ml-auto text-sm font-medium ${overdue ? "font-bold text-red-800" : "text-slate-700"}`}>
                  {overdue ? "Overdue · " : ""}{waited !== null ? `waiting ${fmt(waited)}` : ""}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-slate-300 px-2 py-1 text-xs font-medium">{prog.done} of {prog.total} steps</span>
                <span className="rounded border border-green-600 bg-green-100 px-2 py-1 text-xs"><span aria-hidden>✔</span> Order given</span>
                {STEPS.map((s) => {
                  const at = r[s.key];
                  return canAct ? (
                    <Button key={s.step} variant="outline" className="min-h-9" disabled={busy === r.admissionId} onClick={() => post(r, { step: s.step, done: !at })}>
                      <span aria-hidden>{at ? "✔" : "○"}</span> {s.label}<span className="sr-only">{at ? " done, tap to undo" : " not done, tap to mark done"}</span>
                    </Button>
                  ) : (
                    <span key={s.step} className={`rounded border px-2 py-1 text-xs ${at ? "border-green-600 bg-green-100" : "border-slate-300"}`}>
                      <span aria-hidden>{at ? "✔" : "○"}</span> {s.label} {at ? "done" : "pending"}
                    </span>
                  );
                })}
                {canAct && (
                  <span className="ml-auto">
                    {confirming === r.admissionId ? (
                      <span className="flex gap-2">
                        <Button disabled={busy === r.admissionId} onClick={() => post(r, { step: "left", version: r.bed.version })}>Confirm patient left</Button>
                        <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
                      </span>
                    ) : (
                      <Button variant={allDone ? "default" : "outline"} onClick={() => setConfirming(r.admissionId)}>Patient left</Button>
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
