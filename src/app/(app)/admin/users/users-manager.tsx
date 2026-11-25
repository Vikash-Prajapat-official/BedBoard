"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { callApi, safeRefresh } from "@/lib/client-api";
import { ROLES } from "@/lib/constants";

type User = { id: string; name: string; phone: string; role: string; active: boolean; hasPin: boolean; wardIds: string[] };
type Ward = { id: string; name: string };

function WardPicker({ wards, value, onChange }: { wards: Ward[]; value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations("admin.users");
  if (wards.length === 0) return <p className="text-xs text-slate-700">{t("noWardsYet")}</p>;
  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="text-sm font-medium text-slate-700">{t("wardsLegend")}</legend>
      {wards.map((w) => (
        <label key={w.id} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={value.includes(w.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, w.id] : value.filter((x) => x !== w.id))}
          />
          {w.name}
        </label>
      ))}
    </fieldset>
  );
}

function UserRow({ user, wards, isMe }: { user: User; wards: Ward[]; isMe: boolean }) {
  const t = useTranslations("admin.users");
  const tc = useTranslations("common");
  const tr = useTranslations("role");
  const router = useRouter();
  const [u, setU] = useState(user);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function save(extra: Record<string, unknown> = {}) {
    const r = await callApi("/api/admin/users/" + u.id, "PATCH", {
      name: u.name,
      role: u.role,
      active: u.active,
      wardIds: u.role === "NURSE" ? u.wardIds : undefined,
      password: password || undefined,
      ...extra,
    });
    setMsg(r.ok ? tc("saved") : r.message);
    if (r.ok) {
      setPassword("");
      void safeRefresh(router);
    }
  }

  return (
    <li className={`space-y-2 py-3 ${u.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={t("name")} className="w-48" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} />
        <span className="text-sm text-slate-700">{u.phone}</span>
        <Select aria-label={t("role")} className="w-40" value={u.role} disabled={isMe} onChange={(e) => setU({ ...u, role: e.target.value })}>
          {ROLES.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
        </Select>
        <Badge variant={u.active ? "ok" : "bad"}>{u.active ? t("active") : t("inactive")}</Badge>
        {u.hasPin && <Badge variant="outline">{t("pinSet")}</Badge>}
        {isMe && <Badge variant="outline">{t("you")}</Badge>}
      </div>
      {u.role === "NURSE" && (
        <WardPicker wards={wards} value={u.wardIds} onChange={(wardIds) => setU({ ...u, wardIds })} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={t("newPassword")} type="password" autoComplete="new-password" placeholder={t("newPassword")} className="w-56" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button onClick={() => save()}>{tc("save")}</Button>
        {!isMe && (
          <Button variant="outline" onClick={() => { setU({ ...u, active: !u.active }); void save({ active: !u.active }); }}>
            {u.active ? t("deactivate") : t("activate")}
          </Button>
        )}
        {u.hasPin && <Button variant="outline" onClick={() => save({ resetPin: true })}>{t("resetPin")}</Button>}
        <span role="status" className="text-xs text-slate-700">{msg}</span>
      </div>
    </li>
  );
}

export function UsersManager({ users, wards, meId }: { users: User[]; wards: Ward[]; meId: string }) {
  const t = useTranslations("admin.users");
  const tr = useTranslations("role");
  const router = useRouter();
  const [role, setRole] = useState("NURSE");
  const [wardIds, setWardIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await callApi("/api/admin/users", "POST", {
      name: f.get("name"),
      phone: f.get("phone"),
      password: f.get("password"),
      role,
      wardIds: role === "NURSE" ? wardIds : [],
    });
    if (r.ok) {
      form.reset();
      setWardIds([]);
      setError("");
      void safeRefresh(router);
    } else setError(r.message);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t("addTitle")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
              <Field label={t("name")}><Input name="name" required maxLength={80} /></Field>
              <Field label={t("mobile")}><Input name="phone" type="tel" inputMode="numeric" required maxLength={10} /></Field>
              <Field label={t("startPassword")}><Input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></Field>
              <Field label={t("role")}><Select value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{tr(r)}</option>)}</Select></Field>
            </div>
            {role === "NURSE" && <WardPicker wards={wards} value={wardIds} onChange={setWardIds} />}
            <Button type="submit">{t("add")}</Button>
            {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("listTitle", { n: users.length })}</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">{users.map((u) => <UserRow key={u.id} user={u} wards={wards} isMe={u.id === meId} />)}</ul>
        </CardContent>
      </Card>
    </div>
  );
}
