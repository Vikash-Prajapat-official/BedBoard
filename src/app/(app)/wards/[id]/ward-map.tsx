"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";
import { availableActions, type BedAction } from "@/lib/beds";
import { STATUS_META } from "@/lib/status";
import { OUTCOMES } from "@/lib/validation";
import type { Role } from "@/lib/constants";
import type { WardMap, WardMapBed } from "@/lib/bed-queries";

type FreeBed = { id: string; label: string; bedType: string; version: number; wardName: string };
type Mode = null | "admit" | "block" | "left" | "transfer";

const LABEL: Record<BedAction | "transfer", string> = {
  reserve: "Reserve bed",
  admit: "Admit patient",
  block: "Block bed",
  unblock: "Unblock bed",
  cancelReservation: "Cancel reservation",
  expireReservation: "",
  planDischarge: "Plan discharge",
  cancelPlan: "Cancel discharge plan",
  patientLeft: "Patient left",
  markCleaned: "Mark cleaned",
  transfer: "Transfer patient",
};

const minutes = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
const since = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

export function WardMapView({ map, role, freeBeds, alertHours }: { map: WardMap; role: Role; freeBeds: FreeBed[]; alertHours: number }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Times are formatted only after mount so server and browser time zones cannot disagree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const selected = map.beds.find((b) => b.id === selectedId) ?? null;
  const hasAdmission = (b: WardMapBed) => b.status === "OCCUPIED" || b.status === "DISCHARGE_PLANNED";
  const actions = selected && map.canEdit ? availableActions({ status: selected.status, hasAdmission: hasAdmission(selected) }, role) : [];

  function close() {
    setSelectedId(null);
    setMode(null);
    setError("");
  }

  async function send(url: string, body: unknown, keepOpen = false) {
    setBusy(true);
    setError("");
    const r = await callApi(url, "POST", body);
    setBusy(false);
    if (r.ok) {
      if (!keepOpen) close();
      router.refresh();
      return true;
    }
    setError(r.message);
    if (/refresh/i.test(r.message)) router.refresh();
    return false;
  }

  function run(action: BedAction | "transfer") {
    const b = selected!;
    setError("");
    switch (action) {
      case "reserve": return send(`/api/beds/${b.id}/reserve`, { version: b.version });
      case "unblock":
      case "cancelReservation":
      case "markCleaned": return send(`/api/beds/${b.id}/status`, { to: "FREE", version: b.version });
      case "cancelPlan": return send(`/api/beds/${b.id}/status`, { to: "OCCUPIED", version: b.version });
      case "planDischarge": return send(`/api/admissions/${b.admission!.id}/discharge-step`, { step: "plan", version: b.version });
      case "admit": return setMode("admit");
      case "block": return setMode("block");
      case "patientLeft": return setMode("left");
      case "transfer": return setMode("transfer");
    }
  }

  async function onAdmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await send(`/api/beds/${selected!.id}/admit`, {
      version: selected!.version,
      admittingDoctor: f.get("doctor"),
      patient: {
        uhid: f.get("uhid"),
        name: f.get("name"),
        age: Number(f.get("age")),
        sex: f.get("sex"),
        phone: f.get("phone") || undefined,
      },
    });
  }

  const tick = (step: "order" | "summary" | "bill" | "meds", done: boolean) =>
    send(`/api/admissions/${selected!.admission!.id}/discharge-step`, { step, done, version: step === "order" ? selected!.version : undefined }, true);

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5" aria-label="Beds">
        {map.beds.map((b) => {
          const meta = STATUS_META[b.status];
          const Icon = meta.icon;
          const overdue = b.admission?.dischargeOrderAt && now !== null && minutes(b.admission.dischargeOrderAt, now) >= alertHours * 60;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => { setSelectedId(b.id); setMode(null); setError(""); }}
                className={`h-full w-full rounded-lg border-2 border-l-8 p-2 text-left ${meta.className} ${overdue ? "ring-2 ring-red-600" : ""}`}
              >
                <span className="flex items-center justify-between">
                  <strong>{b.label}</strong>
                  <span className="text-[10px] uppercase tracking-wide">{b.bedType}</span>
                </span>
                <span className="mt-1 flex items-center gap-1 text-xs font-medium">
                  <Icon size={14} aria-hidden /> {meta.label}
                </span>
                {b.admission && (
                  <span className="mt-1 block truncate text-xs">
                    {b.admission.patient.name} · {b.admission.patient.age}{b.admission.patient.sex[0]}
                  </span>
                )}
                {overdue && <span className="mt-1 block text-xs font-bold text-red-800">Discharge overdue</span>}
                {b.status === "RESERVED" && b.reservedUntil && now !== null && (
                  <span className="mt-1 block text-xs">until {new Date(b.reservedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                )}
                {b.status === "BLOCKED" && b.statusReason && <span className="mt-1 block truncate text-xs">{b.statusReason}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {map.beds.length === 0 && <p className="text-sm text-slate-600">This ward has no beds yet.</p>}

      {selected && (
        <div role="dialog" aria-label={`Bed ${selected.label}`} className="fixed inset-x-0 bottom-0 z-10 max-h-[85vh] overflow-y-auto border-t-2 border-blue-700 bg-white p-4 shadow-2xl">
          <div className="mx-auto max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {selected.label} <span className="text-sm font-normal text-slate-600">({selected.bedType.toLowerCase()}) · {STATUS_META[selected.status].label}</span>
              </h2>
              <Button variant="outline" onClick={close}>Close</Button>
            </div>

            {selected.admission && (
              <p className="text-sm">
                {selected.admission.patient.name}, {selected.admission.patient.age} {selected.admission.patient.sex.toLowerCase()} · UHID {selected.admission.patient.uhid} · {selected.admission.admittingDoctor}
              </p>
            )}

            {error && <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">{error}</p>}

            {!map.canEdit && <p className="text-sm text-slate-600">View only.</p>}
            {map.canEdit && actions.length === 0 && <p className="text-sm text-slate-600">No actions available for your role on this bed.</p>}

            {mode === null && (
              <div className="grid grid-cols-2 gap-2">
                {actions.map((a) => (
                  <Button key={a} disabled={busy} variant={a === "block" ? "outline" : "default"} onClick={() => run(a)}>{LABEL[a]}</Button>
                ))}
              </div>
            )}

            {mode === "admit" && (
              <form onSubmit={onAdmit} className="grid gap-3 sm:grid-cols-2">
                <Field label="Patient name"><Input name="name" required maxLength={80} autoFocus /></Field>
                <Field label="UHID"><Input name="uhid" required maxLength={30} /></Field>
                <Field label="Age"><Input name="age" type="number" min={0} max={130} required inputMode="numeric" /></Field>
                <Field label="Sex"><Select name="sex" defaultValue="FEMALE"><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></Select></Field>
                <Field label="Admitting doctor"><Input name="doctor" required maxLength={80} /></Field>
                <Field label="Patient phone (optional)"><Input name="phone" type="tel" inputMode="numeric" maxLength={10} /></Field>
                <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>Admit</Button><Button type="button" variant="outline" onClick={() => setMode(null)}>Back</Button></div>
              </form>
            )}

            {mode === "block" && (
              <form onSubmit={(e) => { e.preventDefault(); const r = new FormData(e.currentTarget).get("reason"); void send(`/api/beds/${selected.id}/status`, { to: "BLOCKED", version: selected.version, reason: r }); }} className="space-y-3">
                <Field label="Reason (shown on the bed)"><Input name="reason" required maxLength={200} autoFocus /></Field>
                <div className="flex gap-2"><Button type="submit" variant="danger" disabled={busy}>Block bed</Button><Button type="button" variant="outline" onClick={() => setMode(null)}>Back</Button></div>
              </form>
            )}

            {mode === "left" && selected.admission && (
              <form onSubmit={(e) => { e.preventDefault(); const o = new FormData(e.currentTarget).get("outcome"); void send(`/api/admissions/${selected.admission!.id}/discharge-step`, { step: "left", outcome: o, version: selected.version }); }} className="space-y-3">
                <Field label="Outcome">
                  <Select name="outcome" defaultValue="DISCHARGED">{OUTCOMES.map((o) => <option key={o} value={o}>{o === "LAMA" ? "Left against medical advice" : o.charAt(0) + o.slice(1).toLowerCase()}</option>)}</Select>
                </Field>
                <p className="text-sm text-slate-600">The bed will move to Cleaning. A normal discharge needs the discharge order first.</p>
                <div className="flex gap-2"><Button type="submit" disabled={busy}>Confirm patient left</Button><Button type="button" variant="outline" onClick={() => setMode(null)}>Back</Button></div>
              </form>
            )}

            {mode === "transfer" && selected.admission && (
              <form onSubmit={(e) => { e.preventDefault(); const id = String(new FormData(e.currentTarget).get("to")); const to = freeBeds.find((x) => x.id === id); if (to) void send(`/api/admissions/${selected.admission!.id}/transfer`, { toBedId: to.id, version: selected.version, toVersion: to.version }); }} className="space-y-3">
                <Field label="Move to free bed">
                  <Select name="to" required defaultValue="">
                    <option value="" disabled>Choose a bed</option>
                    {freeBeds.map((f) => <option key={f.id} value={f.id}>{f.wardName} · {f.label} ({f.bedType.toLowerCase()})</option>)}
                  </Select>
                </Field>
                <div className="flex gap-2"><Button type="submit" disabled={busy}>Transfer</Button><Button type="button" variant="outline" onClick={() => setMode(null)}>Back</Button></div>
              </form>
            )}

            {mode === null && map.canEdit && selected.admission && (role === "NURSE" || role === "DOCTOR") && hasAdmission(selected) && (
              <Checklist bed={selected} now={now} alertHours={alertHours} busy={busy} onTick={tick} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Checklist({ bed, now, alertHours, busy, onTick }: {
  bed: WardMapBed; now: number | null; alertHours: number; busy: boolean;
  onTick: (step: "order" | "summary" | "bill" | "meds", done: boolean) => void;
}) {
  const a = bed.admission!;
  const ordered = !!a.dischargeOrderAt;
  const waited = ordered && now !== null ? minutes(a.dischargeOrderAt!, now) : null;
  const overdue = waited !== null && waited >= alertHours * 60;
  const rows: { step: "order" | "summary" | "bill" | "meds"; label: string; at: string | null; enabled: boolean }[] = [
    { step: "order", label: "Discharge order given", at: a.dischargeOrderAt, enabled: true },
    { step: "summary", label: "Summary ready", at: a.summaryReadyAt, enabled: ordered },
    { step: "bill", label: "Bill cleared", at: a.billClearedAt, enabled: ordered },
    { step: "meds", label: "Medicines given", at: a.medsGivenAt, enabled: ordered },
  ];
  return (
    <section aria-label="Discharge checklist" className="space-y-2 border-t pt-3">
      <h3 className="font-medium">
        Discharge checklist
        {waited !== null && <span className={`ml-2 text-sm ${overdue ? "font-bold text-red-800" : "text-slate-600"}`}>{overdue ? "Overdue: " : ""}ordered {since(waited)} ago</span>}
      </h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.step} className="flex items-center gap-2 text-sm">
            <span aria-hidden>{r.at ? "✔" : "○"}</span>
            <span className="flex-1">{r.label} <span className="sr-only">{r.at ? "done" : "not done"}</span></span>
            <Button variant="outline" className="min-h-9" disabled={busy || !r.enabled} onClick={() => onTick(r.step, !r.at)}>{r.at ? "Undo" : "Mark done"}</Button>
          </li>
        ))}
      </ul>
      {!ordered && <p className="text-xs text-slate-600">The other steps unlock once the discharge order is given.</p>}
    </section>
  );
}
