"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { callApi, safeRefresh } from "@/lib/client-api";
import { availableActions, type BedAction } from "@/lib/beds";
import { formatMinutes } from "@/lib/duration";
import { STATUS_META } from "@/lib/status";
import { OUTCOMES } from "@/lib/validation";
import type { Role } from "@/lib/constants";
import type { WardMap, WardMapBed } from "@/lib/bed-queries";

type FreeBed = { id: string; label: string; bedType: string; version: number; wardName: string };
type Mode = null | "admit" | "block" | "left" | "transfer";

const minutes = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

export function WardMapView({ map, role, freeBeds, alertHours }: { map: WardMap; role: Role; freeBeds: FreeBed[]; alertHours: number }) {
  const t = useTranslations("ward");
  const ts = useTranslations("status");
  const tb = useTranslations("bedType");
  const tx = useTranslations("sex");
  const to = useTranslations("outcome");
  const tt = useTranslations("time");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Times are formatted only after mount so server and browser time zones cannot disagree.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
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
    const r = await callApi(url, "POST", body, { queue: t("queueLabel", { ward: map.ward.name, bed: selected?.label ?? "" }) });
    setBusy(false);
    if (r.ok) {
      if (!keepOpen) close();
      void safeRefresh(router);
      return true;
    }
    setError(r.message);
    if (/refresh|रीफ़्रेश/i.test(r.message)) void safeRefresh(router);
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

  const clock = (iso: string) => new Date(iso).toLocaleTimeString(locale === "hi" ? "hi-IN" : "en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5" aria-label={t("bedsAria")}>
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
                  <span className="text-[10px] uppercase tracking-wide">{tb(b.bedType as never)}</span>
                </span>
                <span className="mt-1 flex items-center gap-1 text-xs font-medium">
                  <Icon size={14} aria-hidden /> {ts(b.status)}
                </span>
                {b.admission && (
                  <span className="mt-1 block truncate text-xs">
                    {b.admission.patient.name} · {b.admission.patient.age} {tx(b.admission.patient.sex as never)}
                  </span>
                )}
                {overdue && <span className="mt-1 block text-xs font-bold text-red-800">{t("overdue")}</span>}
                {b.status === "RESERVED" && b.reservedUntil && now !== null && (
                  <span className="mt-1 block text-xs">{t("until", { time: clock(b.reservedUntil) })}</span>
                )}
                {b.status === "BLOCKED" && b.statusReason && <span className="mt-1 block truncate text-xs">{b.statusReason}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {map.beds.length === 0 && <p className="text-sm text-slate-700">{t("noBeds")}</p>}

      {selected && (
        <div role="dialog" aria-label={t("dialogAria", { label: selected.label })} className="fixed inset-x-0 bottom-0 z-10 max-h-[85vh] overflow-y-auto border-t-2 border-blue-700 bg-white p-4 shadow-2xl">
          <div className="mx-auto max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {selected.label} <span className="text-sm font-normal text-slate-700">({tb(selected.bedType as never)}) · {ts(selected.status)}</span>
              </h2>
              <Button variant="outline" onClick={close}>{tc("close")}</Button>
            </div>

            {selected.admission && (
              <p className="text-sm">
                {t("patientLine", { name: selected.admission.patient.name, age: selected.admission.patient.age, sex: tx(selected.admission.patient.sex as never), uhid: selected.admission.patient.uhid, doctor: selected.admission.admittingDoctor })}
              </p>
            )}

            {error && <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">{error}</p>}

            {!map.canEdit && <p className="text-sm text-slate-700">{t("viewOnly")}</p>}
            {map.canEdit && actions.length === 0 && <p className="text-sm text-slate-700">{t("noActions")}</p>}

            {mode === null && (
              <div className="grid grid-cols-2 gap-2">
                {actions.map((a) => (
                  <Button key={a} disabled={busy} variant={a === "block" ? "outline" : "default"} onClick={() => run(a)}>{t(`actions.${a}`)}</Button>
                ))}
              </div>
            )}

            {mode === "admit" && (
              <form onSubmit={onAdmit} className="grid gap-3 sm:grid-cols-2">
                <Field label={t("admit.name")}><Input name="name" required maxLength={80} autoFocus /></Field>
                <Field label={t("admit.uhid")}><Input name="uhid" required maxLength={30} /></Field>
                <Field label={t("admit.age")}><Input name="age" type="number" min={0} max={130} required inputMode="numeric" /></Field>
                <Field label={t("admit.sex")}><Select name="sex" defaultValue="FEMALE"><option value="MALE">{tx("MALE")}</option><option value="FEMALE">{tx("FEMALE")}</option><option value="OTHER">{tx("OTHER")}</option></Select></Field>
                <Field label={t("admit.doctor")}><Input name="doctor" required maxLength={80} /></Field>
                <Field label={t("admit.phone")}><Input name="phone" type="tel" inputMode="numeric" maxLength={10} /></Field>
                <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{t("admit.submit")}</Button><BackButton onClick={() => setMode(null)} /></div>
              </form>
            )}

            {mode === "block" && (
              <form onSubmit={(e) => { e.preventDefault(); const r = new FormData(e.currentTarget).get("reason"); void send(`/api/beds/${selected.id}/status`, { to: "BLOCKED", version: selected.version, reason: r }); }} className="space-y-3">
                <Field label={t("block.reason")}><Input name="reason" required maxLength={200} autoFocus /></Field>
                <div className="flex gap-2"><Button type="submit" variant="danger" disabled={busy}>{t("block.submit")}</Button><BackButton onClick={() => setMode(null)} /></div>
              </form>
            )}

            {mode === "left" && selected.admission && (
              <form onSubmit={(e) => { e.preventDefault(); const o = new FormData(e.currentTarget).get("outcome"); void send(`/api/admissions/${selected.admission!.id}/discharge-step`, { step: "left", outcome: o, version: selected.version }); }} className="space-y-3">
                <Field label={t("left.outcome")}>
                  <Select name="outcome" defaultValue="DISCHARGED">{OUTCOMES.map((o) => <option key={o} value={o}>{to(o)}</option>)}</Select>
                </Field>
                <p className="text-sm text-slate-700">{t("left.note")}</p>
                <div className="flex gap-2"><Button type="submit" disabled={busy}>{t("left.confirm")}</Button><BackButton onClick={() => setMode(null)} /></div>
              </form>
            )}

            {mode === "transfer" && selected.admission && (
              <form onSubmit={(e) => { e.preventDefault(); const id = String(new FormData(e.currentTarget).get("to")); const dest = freeBeds.find((x) => x.id === id); if (dest) void send(`/api/admissions/${selected.admission!.id}/transfer`, { toBedId: dest.id, version: selected.version, toVersion: dest.version }); }} className="space-y-3">
                <Field label={t("transfer.label")}>
                  <Select name="to" required defaultValue="">
                    <option value="" disabled>{t("transfer.choose")}</option>
                    {freeBeds.map((f) => <option key={f.id} value={f.id}>{f.wardName} · {f.label} ({tb(f.bedType as never)})</option>)}
                  </Select>
                </Field>
                <div className="flex gap-2"><Button type="submit" disabled={busy}>{t("transfer.submit")}</Button><BackButton onClick={() => setMode(null)} /></div>
              </form>
            )}

            {mode === null && map.canEdit && selected.admission && (role === "NURSE" || role === "DOCTOR") && hasAdmission(selected) && (
              <Checklist bed={selected} now={now} alertHours={alertHours} busy={busy} onTick={tick} fmt={(m) => formatMinutes(m, tt)} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  const tc = useTranslations("common");
  return <Button type="button" variant="outline" onClick={onClick}>{tc("back")}</Button>;
}

function Checklist({ bed, now, alertHours, busy, onTick, fmt }: {
  bed: WardMapBed; now: number | null; alertHours: number; busy: boolean;
  onTick: (step: "order" | "summary" | "bill" | "meds", done: boolean) => void;
  fmt: (m: number) => string;
}) {
  const tl = useTranslations("ward.checklist");
  const a = bed.admission!;
  const ordered = !!a.dischargeOrderAt;
  const waited = ordered && now !== null ? minutes(a.dischargeOrderAt!, now) : null;
  const overdue = waited !== null && waited >= alertHours * 60;
  const rows: { step: "order" | "summary" | "bill" | "meds"; at: string | null; enabled: boolean }[] = [
    { step: "order", at: a.dischargeOrderAt, enabled: true },
    { step: "summary", at: a.summaryReadyAt, enabled: ordered },
    { step: "bill", at: a.billClearedAt, enabled: ordered },
    { step: "meds", at: a.medsGivenAt, enabled: ordered },
  ];
  return (
    <section aria-label={tl("title")} className="space-y-2 border-t pt-3">
      <h3 className="font-medium">
        {tl("title")}
        {waited !== null && <span className={`ml-2 text-sm ${overdue ? "font-bold text-red-800" : "text-slate-700"}`}>{overdue ? tl("overdue") : ""}{tl("ordered", { since: fmt(waited) })}</span>}
      </h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.step} className="flex items-center gap-2 text-sm">
            <span aria-hidden>{r.at ? "✔" : "○"}</span>
            <span className="flex-1">{tl(r.step)} <span className="sr-only">{r.at ? tl("done") : tl("notDone")}</span></span>
            <Button variant="outline" className="min-h-9" disabled={busy || !r.enabled} onClick={() => onTick(r.step, !r.at)}>{r.at ? tl("undo") : tl("markDone")}</Button>
          </li>
        ))}
      </ul>
      {!ordered && <p className="text-xs text-slate-700">{tl("unlock")}</p>}
    </section>
  );
}
