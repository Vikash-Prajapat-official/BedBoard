"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { callApi } from "@/lib/client-api";
import { BED_TYPES } from "@/lib/constants";
import { buildBedLabels } from "@/lib/bed-labels";
import { STATUS_META, type BedStatusKey } from "@/lib/status";

type Bed = { id: string; label: string; bedType: string; status: string };
type Ward = { id: string; name: string; beds: Bed[] };

function BedRow({ bed }: { bed: Bed }) {
  const router = useRouter();
  const [b, setB] = useState(bed);
  const [msg, setMsg] = useState("");
  const meta = STATUS_META[bed.status as BedStatusKey];
  const Icon = meta.icon;

  async function save() {
    const r = await callApi("/api/admin/beds/" + b.id, "PATCH", { label: b.label, bedType: b.bedType });
    setMsg(r.ok ? "Saved" : r.message);
    if (r.ok) router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-1">
      <Input aria-label="Bed label" className="w-32" value={b.label} onChange={(e) => setB({ ...b, label: e.target.value })} />
      <Select aria-label="Bed type" className="w-36" value={b.bedType} onChange={(e) => setB({ ...b, bedType: e.target.value })}>
        {BED_TYPES.map((t) => <option key={t}>{t}</option>)}
      </Select>
      <span className={`inline-flex items-center gap-1 rounded border-l-4 px-2 py-1 text-xs ${meta.className}`}>
        <Icon size={14} aria-hidden /> {meta.label}
      </span>
      <Button variant="outline" className="min-h-9" onClick={save}>Save</Button>
      <span role="status" className="text-xs text-slate-600">{msg}</span>
    </li>
  );
}

export function BedsManager({ wards }: { wards: Ward[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ wardId: wards[0]?.id ?? "", bedType: "GENERAL", prefix: "Bed", from: 1, to: 10 });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const preview =
    form.to >= form.from && form.to - form.from < 200 ? buildBedLabels(form.prefix, form.from, form.to) : [];

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const r = await callApi<{ created: number; skipped: number }>("/api/admin/beds", "POST", {
      ...form,
      from: Number(form.from),
      to: Number(form.to),
    });
    if (r.ok) {
      setMsg({ ok: true, text: `Added ${r.data.created} beds` + (r.data.skipped ? `, skipped ${r.data.skipped} that already existed` : "") });
      router.refresh();
    } else setMsg({ ok: false, text: r.message });
  }

  if (wards.length === 0) {
    return <p className="text-sm text-slate-700">Add a ward first (Admin, then Wards), then come back to add beds.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Add beds in bulk</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-6 sm:items-end">
            <Field label="Ward">
              <Select value={form.wardId} onChange={(e) => setForm({ ...form, wardId: e.target.value })}>
                {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
            <Field label="Bed type">
              <Select value={form.bedType} onChange={(e) => setForm({ ...form, bedType: e.target.value })}>
                {BED_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Name prefix"><Input value={form.prefix} maxLength={20} onChange={(e) => setForm({ ...form, prefix: e.target.value })} /></Field>
            <Field label="From"><Input type="number" min={1} value={form.from} onChange={(e) => setForm({ ...form, from: Number(e.target.value) })} /></Field>
            <Field label="To"><Input type="number" min={1} value={form.to} onChange={(e) => setForm({ ...form, to: Number(e.target.value) })} /></Field>
            <Button type="submit">Add beds</Button>
          </form>
          <p className="mt-2 text-sm text-slate-600">
            {preview.length > 0
              ? `Will create ${preview.length}: ${preview.slice(0, 3).join(", ")}${preview.length > 3 ? ` ... ${preview[preview.length - 1]}` : ""}`
              : "Enter a range of up to 200 beds."}
          </p>
          {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-green-800" : "text-red-800"}`}>{msg.text}</p>}
        </CardContent>
      </Card>

      {wards.map((w) => (
        <Card key={w.id}>
          <CardHeader><CardTitle>{w.name} ({w.beds.length} beds)</CardTitle></CardHeader>
          <CardContent>
            {w.beds.length === 0 ? <p className="text-sm text-slate-600">No beds yet.</p> : <ul className="divide-y">{w.beds.map((b) => <BedRow key={b.id} bed={b} />)}</ul>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
