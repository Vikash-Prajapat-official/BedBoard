"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/client-api";
import { STATUS_META } from "@/lib/status";
import type { FoundBed, ReservedBed } from "@/lib/bed-queries";

export function FindBedList({ beds, reserved, reservationMinutes }: { beds: FoundBed[]; reserved: ReservedBed[]; reservationMinutes: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Clock-dependent text is rendered after mount only (server and browser time zones differ).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  async function act(bed: { id: string; version: number }, kind: "reserve" | "cancel", label: string) {
    setBusy(bed.id);
    setMsg(null);
    const r =
      kind === "reserve"
        ? await callApi(`/api/beds/${bed.id}/reserve`, "POST", { version: bed.version })
        : await callApi(`/api/beds/${bed.id}/status`, "POST", { to: "FREE", version: bed.version });
    setBusy(null);
    if (r.ok) setMsg({ ok: true, text: kind === "reserve" ? `${label} reserved for ${reservationMinutes} minutes` : `${label} released` });
    else setMsg({ ok: false, text: r.message });
    router.refresh();
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

      <section aria-label="Free beds" className="space-y-3">
        <h2 className="font-semibold">{beds.length} free bed{beds.length === 1 ? "" : "s"} match</h2>
        {beds.length === 0 && <p className="text-sm text-slate-600">No free bed matches these filters right now. This list updates by itself when one is freed.</p>}
        {groups.map((g) => (
          <div key={g.name} className="rounded-xl border bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-medium text-slate-700">{g.name} · floor {g.floor} · {g.beds.length} free</h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.beds.map((b) => (
                <li key={b.id} className={`flex items-center gap-2 rounded-lg border-l-8 p-2 ${Free.className}`}>
                  <Free.icon size={16} aria-hidden />
                  <span className="flex-1"><strong>{b.label}</strong> <span className="text-xs">{b.bedType.toLowerCase()} · {Free.label}</span></span>
                  <Button disabled={busy === b.id} onClick={() => act(b, "reserve", `${g.name} ${b.label}`)}>Reserve</Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-label="Reserved beds" className="space-y-2">
        <h2 className="font-semibold">Reserved now ({reserved.length})</h2>
        {reserved.length === 0 && <p className="text-sm text-slate-600">Nothing reserved.</p>}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reserved.map((b) => {
            const m = left(b.reservedUntil);
            return (
              <li key={b.id} className={`flex items-center gap-2 rounded-lg border-l-8 p-2 ${Reserved.className}`}>
                <Reserved.icon size={16} aria-hidden />
                <span className="flex-1 text-sm"><strong>{b.wardName} {b.label}</strong><br /><span className="text-xs">{Reserved.label}{m !== null ? ` · ${m} min left` : ""}</span></span>
                <Button variant="outline" disabled={busy === b.id} onClick={() => act(b, "cancel", `${b.wardName} ${b.label}`)}>Cancel</Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
