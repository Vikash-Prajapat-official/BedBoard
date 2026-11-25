"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { callApi, safeRefresh } from "@/lib/client-api";
import { WARD_GENDERS } from "@/lib/constants";

type Ward = { id: string; name: string; gender: string; floor: number; specialty: string; active: boolean; bedCount: number };

function WardRow({ ward }: { ward: Ward }) {
  const t = useTranslations("admin.wards");
  const tc = useTranslations("common");
  const tg = useTranslations("gender");
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
      setMsg(tc("saved"));
      void safeRefresh(router);
    } else setMsg(r.message);
  }

  return (
    <tr className={w.active ? "" : "opacity-60"}>
      <td className="p-1"><Input aria-label={t("nameAria")} value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></td>
      <td className="p-1">
        <Select aria-label={t("gender")} value={w.gender} onChange={(e) => setW({ ...w, gender: e.target.value })}>
          {WARD_GENDERS.map((g) => <option key={g} value={g}>{tg(g)}</option>)}
        </Select>
      </td>
      <td className="p-1"><Input aria-label={t("floor")} type="number" className="w-20" value={w.floor} onChange={(e) => setW({ ...w, floor: Number(e.target.value) })} /></td>
      <td className="p-1"><Input aria-label={t("specialty")} value={w.specialty} onChange={(e) => setW({ ...w, specialty: e.target.value })} /></td>
      <td className="p-1 text-center">{w.bedCount}</td>
      <td className="flex gap-2 p-1">
        <Button onClick={() => save({})}>{tc("save")}</Button>
        <Button variant="outline" onClick={() => save({ active: !w.active })}>{w.active ? t("deactivate") : t("activate")}</Button>
        <span role="status" className="self-center text-xs text-slate-700">{msg}</span>
      </td>
    </tr>
  );
}

export function WardsManager({ wards }: { wards: Ward[] }) {
  const t = useTranslations("admin.wards");
  const tg = useTranslations("gender");
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
      void safeRefresh(router);
    } else setError(r.message);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t("addTitle")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-5 sm:items-end">
            <Field label={t("name")}><Input name="name" required maxLength={80} /></Field>
            <Field label={t("gender")}>
              <Select name="gender" defaultValue="ANY">{WARD_GENDERS.map((g) => <option key={g} value={g}>{tg(g)}</option>)}</Select>
            </Field>
            <Field label={t("floor")}><Input name="floor" type="number" defaultValue={0} /></Field>
            <Field label={t("specialty")}><Input name="specialty" maxLength={80} /></Field>
            <Button type="submit">{t("add")}</Button>
          </form>
          {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("listTitle", { n: wards.length })}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {wards.length === 0 ? (
            <p className="text-sm text-slate-700">{t("none")}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-700"><th className="p-1">{t("name")}</th><th className="p-1">{t("gender")}</th><th className="p-1">{t("floor")}</th><th className="p-1">{t("specialty")}</th><th className="p-1">{t("colBeds")}</th><th /></tr>
              </thead>
              <tbody>{wards.map((w) => <WardRow key={w.id} ward={w} />)}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
