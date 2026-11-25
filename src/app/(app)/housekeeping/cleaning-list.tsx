"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { callApi, safeRefresh } from "@/lib/client-api";
import { STATUS_META } from "@/lib/status";
import { waitingMinutes } from "@/lib/stats";
import type { Role } from "@/lib/constants";
import type { CleaningBed } from "@/lib/bed-queries";

export function CleaningList({ beds, role, wardIds }: { beds: CleaningBed[]; role: Role; wardIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Housekeeping cleans anywhere; a nurse only in her own wards; admins just look.
  const canClean = (b: CleaningBed) => role === "HOUSEKEEPING" || (role === "NURSE" && wardIds.includes(b.wardId));
  const meta = STATUS_META.CLEANING;

  async function clean(b: CleaningBed) {
    setBusy(b.id);
    setError("");
    const r = await callApi(`/api/beds/${b.id}/status`, "POST", { to: "FREE", version: b.version }, { queue: `Clean ${b.wardName} ${b.label}` });
    setBusy(null);
    if (!r.ok) setError(r.message);
    void safeRefresh(router);
  }

  if (beds.length === 0) return <p className="rounded-xl border bg-white p-6 text-center text-slate-700">All beds are clean. Nothing waiting.</p>;

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">{error}</p>}
      <p className="text-sm text-slate-600">Longest waiting first.</p>
      <ol className="space-y-2">
        {beds.map((b) => {
          const m = now ? waitingMinutes(new Date(b.since), now) : null;
          return (
            <li key={b.id} className={`flex items-center gap-3 rounded-lg border-l-8 p-3 ${meta.className}`}>
              <meta.icon size={20} aria-hidden />
              <span className="flex-1">
                <strong className="text-lg">{b.wardName} · {b.label}</strong>
                <br />
                <span className="text-sm">{meta.label} · {b.bedType.toLowerCase()}{m !== null ? ` · waiting ${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`}` : ""}</span>
              </span>
              {canClean(b) && <Button className="min-h-12 px-6 text-base" disabled={busy === b.id} onClick={() => clean(b)}>Mark clean</Button>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
