"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { callApi, safeRefresh } from "@/lib/client-api";
import { STATUS_META } from "@/lib/status";
import type { FoundBed, ReservedBed } from "@/lib/bed-queries";

export function FindBedList({ beds, reserved, reservationMinutes }: { beds: FoundBed[]; reserved: ReservedBed[]; reservationMinutes: number }) {
  const t = useTranslations("find");
  const ts = useTranslations("status");
  const tb = useTranslations("bedType");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Clock-dependent text is rendered after mount only (server and browser time zones differ).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(i);
  }, []);

  async function act(bed: { id: string; version: number }, kind: "reserve" | "cancel", label: string) {
    setBusy(bed.id);
    setMsg(null);
    const r =
      kind === "reserve"
        ? await callApi(`/api/beds/${bed.id}/reserve`, "POST", { version: bed.version }, { queue: t("queueReserve", { bed: label }) })
        : await callApi(`/api/beds/${bed.id}/status`, "POST", { to: "FREE", version: bed.version }, { queue: t("queueRelease", { bed: label }) });
    setBusy(null);
    if (r.ok && r.queued) setMsg({ ok: true, text: t("queued", { bed: label }) });
    else if (r.ok) setMsg({ ok: true, text: kind === "reserve" ? t("reserved", { bed: label, minutes: reservationMinutes }) : t("released", { bed: label }) });
    else setMsg({ ok: false, text: r.message });
    void safeRefresh(router);
  }

  const left = (iso: string | null) => (iso && now !== null ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60_000)) : null);
  const Free = STATUS_META.FREE;
  const Reserved = STATUS_META.RESERVED;

  // Group by ward, in the order the query returned them.
  const groups: { name: string; floor: number; beds: FoundBed[] }[] = [];
  for (const b of beds) {
    const g = groups.find((x) => x.name === b.ward.name);
    if (g) g.beds.push(b);
    else groups.push({ name: b.ward.name, floor: b.ward.floor, beds: [b] });
  }

  return (
    <div className="space-y-6">
      {msg && <p role="status" className={`rounded-md border p-2 text-sm ${msg.ok ? "border-green-600 bg-green-100 text-green-900" : "border-red-600 bg-red-100 text-red-900"}`}>{msg.text}</p>}

      <section aria-label={t("freeAria")} className="space-y-3">
        <h2 className="font-semibold">{t("matches", { count: beds.length })}</h2>
        {beds.length === 0 && <p className="text-sm text-slate-700">{t("none")}</p>}
        {groups.map((g) => (
          <div key={g.name} className="rounded-xl border bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-medium text-slate-700">{t("group", { ward: g.name, floor: g.floor, n: g.beds.length })}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.beds.map((b) => (
                <li key={b.id} className={`flex items-center gap-2 rounded-lg border-l-8 p-2 ${Free.className}`}>
                  <Free.icon size={16} aria-hidden />
                  <span className="flex-1"><strong>{b.label}</strong> <span className="text-xs">{tb(b.bedType as never)} · {ts("FREE")}</span></span>
                  <Button disabled={busy === b.id} onClick={() => act(b, "reserve", `${g.name} ${b.label}`)}>{t("reserve")}</Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-label={t("reservedAria")} className="space-y-2">
        <h2 className="font-semibold">{t("reservedNow", { n: reserved.length })}</h2>
        {reserved.length === 0 && <p className="text-sm text-slate-700">{t("nothingReserved")}</p>}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reserved.map((b) => {
            const m = left(b.reservedUntil);
            return (
              <li key={b.id} className={`flex items-center gap-2 rounded-lg border-l-8 p-2 ${Reserved.className}`}>
                <Reserved.icon size={16} aria-hidden />
                <span className="flex-1 text-sm"><strong>{b.wardName} {b.label}</strong><br /><span className="text-xs">{ts("RESERVED")}{m !== null ? ` · ${t("minLeft", { n: m })}` : ""}</span></span>
                <Button variant="outline" disabled={busy === b.id} onClick={() => act(b, "cancel", `${b.wardName} ${b.label}`)}>{t("cancel")}</Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
