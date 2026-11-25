"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { callApi } from "@/lib/client-api";
import { WARD_GENDERS } from "@/lib/constants";

type Ward = { id: string; name: string; gender: string; floor: number; specialty: string; active: boolean; bedCount: number };

function WardRow({ ward }: { ward: Ward }) {
  const router = useRouter();
  const [w, setW] = useState(ward);
  const [msg, setMsg] = useState("");

  async function save(patch: Partial<Ward>) {
    const next = { ...w, ...patch };
    const r = await callApi("/api/admin/wards/" + w.id, "PATCH", {
      name: next.name,
      gender: next.gender,
      floor: Number(next.floor),
      specialty: next.specialty || undefined,
      active: next.active,
    });
    if (r.ok) {
      setW(next);
      setMsg("Saved");
      router.refresh();
    } else setMsg(r.message);
  }

  return (
    <tr className={w.active ? "" : "opacity-60"}>
      <td className="p-1"><Input aria-label="Ward name" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></td>
      <td className="p-1">
        <Select aria-label="Gender" value={w.gender} onChange={(e) => setW({ ...w, gender: e.target.value })}>
          {WARD_GENDERS.map((g) => <option key={g}>{g}</option>)}
        </Select>
      </td>
      <td className="p-1"><Input aria-label="Floor" type="number" className="w-20" value={w.floor} onChange={(e) => setW({ ...w, floor: Number(e.target.value) })} /></td>
      <td className="p-1"><Input aria-label="Specialty" value={w.specialty} onChange={(e) => setW({ ...w, specialty: e.target.value })} /></td>
      <td className="p-1 text-center">{w.bedCount}</td>
      <td className="flex gap-2 p-1">
        <Button onClick={() => save({})}>Save</Button>
        <Button variant="outline" onClick={() => save({ active: !w.active })}>{w.active ? "Deactivate" : "Activate"}</Button>
        <span role="status" className="self-center text-xs text-slate-600">{msg}</span>
      </td>
    </tr>
  );
}

export function WardsManager({ wards }: { wards: Ward[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await callApi("/api/admin/wards", "POST", {
      name: f.get("name"),
      gender: f.get("gender"),
      floor: Number(f.get("floor") || 0),
      specialty: f.get("specialty") || undefined,
    });
    if (r.ok) {
      form.reset();
      setError("");
      router.refresh();
    } else setError(r.message);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Add a ward</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-5 sm:items-end">
            <Field label="Name"><Input name="name" required maxLength={80} /></Field>
            <Field label="Gender">
              <Select name="gender" defaultValue="ANY">{WARD_GENDERS.map((g) => <option key={g}>{g}</option>)}</Select>
            </Field>
            <Field label="Floor"><Input name="floor" type="number" defaultValue={0} /></Field>
            <Field label="Specialty"><Input name="specialty" maxLength={80} /></Field>
            <Button type="submit">Add ward</Button>
          </form>
          {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Wards ({wards.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {wards.length === 0 ? (
            <p className="text-sm text-slate-600">No wards yet. Add the first one above.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-600"><th className="p-1">Name</th><th className="p-1">Gender</th><th className="p-1">Floor</th><th className="p-1">Specialty</th><th className="p-1">Beds</th><th /></tr>
              </thead>
              <tbody>{wards.map((w) => <WardRow key={w.id} ward={w} />)}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
