"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BED_STATUSES, type BedStatus } from "@/lib/beds";
import { STATUS_META } from "@/lib/status";

// The next step a tap moves a bed to, following the real state machine's happy path.
const NEXT: Record<BedStatus, BedStatus> = {
  FREE: "RESERVED",
  RESERVED: "OCCUPIED",
  OCCUPIED: "DISCHARGE_PLANNED",
  DISCHARGE_PLANNED: "CLEANING",
  CLEANING: "FREE",
  BLOCKED: "FREE",
};

const START: BedStatus[] = [
  "OCCUPIED", "FREE", "OCCUPIED", "DISCHARGE_PLANNED", "CLEANING", "FREE",
  "RESERVED", "OCCUPIED", "BLOCKED", "OCCUPIED", "FREE", "OCCUPIED",
];

/** A made-up ward on the home page. Runs in the browser only: nothing is sent or saved. */
export function WardDemo() {
  const t = useTranslations("landing.demo");
  const ts = useTranslations("status");
  const [beds, setBeds] = useState<BedStatus[]>(START);
  const [said, setSaid] = useState("");

  function tap(i: number) {
    const to = NEXT[beds[i]!];
    setBeds(beds.map((s, j) => (j === i ? to : s)));
    setSaid(`${t("bed", { n: i + 1 })}: ${ts(to)}`);
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-lg">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="mb-3 text-sm text-slate-700">{t("hint")}</p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t("ward")}>
        {beds.map((status, i) => {
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => tap(i)}
                aria-label={`${t("bed", { n: i + 1 })}: ${ts(status)}. ${t("next", { status: ts(NEXT[status]) })}`}
                className={`h-full min-h-16 w-full rounded-lg border-2 border-l-8 p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${meta.className}`}
              >
                <span className="block text-sm font-bold">{t("bed", { n: i + 1 })}</span>
                <span className="mt-1 flex items-center gap-1 text-xs font-medium">
                  <Icon size={14} aria-hidden /> {ts(status)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">{said}</p>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("legend")}>
        {BED_STATUSES.map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <li key={s} className={`flex items-center gap-1 rounded-md border-l-4 px-2 py-1 text-xs ${meta.className}`}>
              <Icon size={12} aria-hidden /> {ts(s)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
