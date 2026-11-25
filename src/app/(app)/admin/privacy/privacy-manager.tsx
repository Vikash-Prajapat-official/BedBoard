"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { callApi } from "@/lib/client-api";
import type { PatientRow } from "@/lib/patient-admin";

function PatientCard({ patient, onErased }: { patient: PatientRow; onErased: (id: string) => void }) {
  const t = useTranslations("privacy");
  const tx = useTranslations("sex");
  const tc = useTranslations("common");
  const [p, setP] = useState(patient);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await callApi<{ patient: PatientRow }>("/api/admin/patients/" + p.id, "PATCH", {
      name: p.name,
      age: Number(p.age),
      sex: p.sex,
      phone: p.phone ? p.phone : null,
    });
    if (r.ok) {
      setP(r.data.patient);
      setMsg({ ok: true, text: t("saved") });
    } else setMsg({ ok: false, text: r.message });
  }

  async function erase() {
    const r = await callApi("/api/admin/patients/" + p.id + "/anonymise", "POST");
    setConfirming(false);
    if (r.ok) onErased(p.id);
    else setMsg({ ok: false, text: r.message });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <p className="text-sm text-slate-700">
          {t("uhid")} <strong>{p.uhid}</strong> · {t("stays", { count: p.stays })}
        </p>
        {p.admittedNow && <p className="rounded-md border border-amber-600 bg-amber-100 p-2 text-sm text-amber-900">{t("admittedNow")}</p>}
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <Field label={t("name")}><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required maxLength={80} /></Field>
          <Field label={t("age")}><Input type="number" min={0} max={130} value={p.age} onChange={(e) => setP({ ...p, age: Number(e.target.value) })} required /></Field>
          <Field label={t("sex")}>
            <Select value={p.sex} onChange={(e) => setP({ ...p, sex: e.target.value as PatientRow["sex"] })}>
              <option value="MALE">{tx("MALE")}</option><option value="FEMALE">{tx("FEMALE")}</option><option value="OTHER">{tx("OTHER")}</option>
            </Select>
          </Field>
          <Field label={t("phone")}><Input type="tel" inputMode="numeric" maxLength={10} value={p.phone ?? ""} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
          <Button type="submit">{t("save")}</Button>
        </form>
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-green-800" : "text-red-800"}`}>{msg.text}</p>}

        {!p.admittedNow && (
          confirming ? (
            <div role="alertdialog" className="space-y-2 rounded-md border border-red-600 bg-red-50 p-3">
              <p className="text-sm text-red-900">{t("eraseConfirm")}</p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={erase}>{t("eraseYes")}</Button>
                <Button variant="outline" onClick={() => setConfirming(false)}>{tc("cancel")}</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setConfirming(true)}>{t("erase")}</Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

export function PrivacyManager() {
  const t = useTranslations("privacy");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  const [note, setNote] = useState("");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setNote("");
    if (q.trim().length < 2) return setNote(t("minChars"));
    const r = await callApi<{ patients: PatientRow[] }>("/api/admin/patients?q=" + encodeURIComponent(q.trim()), "GET");
    if (r.ok) setRows(r.data.patients);
    else setNote(r.message);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <Field label={t("search")}><Input value={q} onChange={(e) => setQ(e.target.value)} className="w-64" /></Field>
        <Button type="submit">{t("searchBtn")}</Button>
        {note && <span role="alert" className="text-sm text-red-800">{note}</span>}
      </form>
      {rows && rows.length === 0 && <p className="text-sm text-slate-700">{t("none")}</p>}
      {rows?.map((p) => (
        <PatientCard key={p.id} patient={p} onErased={(id) => { setRows(rows.filter((x) => x.id !== id)); setNote(t("erased")); }} />
      ))}
    </div>
  );
}
