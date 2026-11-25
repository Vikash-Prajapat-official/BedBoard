"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QUEUE_CHANGED, offlineQueue, replayOffline, safeRefresh } from "@/lib/client-api";
import { localizedError } from "@/lib/error-messages";
import type { ReplayResult } from "@/lib/offline-queue";

/**
 * Shows what is waiting in the offline queue and replays it when the network is back.
 * A stale action (the bed changed meanwhile) is not applied; the nurse is told "Bed changed, please refresh".
 */
export function OfflineSync() {
  const t = useTranslations("offline");
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [result, setResult] = useState<ReplayResult | null>(null);

  const count = useCallback(async () => setPending((await offlineQueue.list()).length), []);

  const sync = useCallback(async () => {
    if ((await offlineQueue.list()).length === 0) return;
    const r = await replayOffline();
    if (r.skipped) return;
    setPending(r.remaining);
    if (r.sent || r.conflicts.length || r.rejected.length || r.needsLogin) setResult(r);
    if (r.sent || r.conflicts.length) void safeRefresh(router);
  }, [router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void count();
    void sync();
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    const onChange = () => void count();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(QUEUE_CHANGED, onChange);
    // navigator.onLine is unreliable on phones, so also retry while anything is waiting.
    const i = setInterval(() => void sync(), 20_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(QUEUE_CHANGED, onChange);
      clearInterval(i);
    };
  }, [count, sync]);

  // The "all sent" note fades by itself; problems stay until dismissed.
  useEffect(() => {
    if (!result || result.conflicts.length || result.rejected.length || result.needsLogin) return;
    const i = setTimeout(() => setResult(null), 5000);
    return () => clearTimeout(i);
  }, [result]);

  const problems = result
    ? [
        ...result.conflicts.map((c) => ({ id: c.action.id, label: c.action.label, text: localizedError("VERSION_CONFLICT", c.message) })),
        ...result.rejected.map((c) => ({ id: c.action.id, label: c.action.label, text: localizedError(c.code, c.message) })),
      ]
    : [];
  return (
    <div className="space-y-2" aria-live="polite">
      {(!online || pending > 0) && (
        <p role="status" className="rounded-md border border-amber-600 bg-amber-100 p-2 text-sm text-amber-900">
          <strong>{online ? t("sending") : t("offline")}</strong>{" "}
          {pending > 0 ? t("saved", { count: pending }) : t("keepWorking")}
        </p>
      )}
      {result?.needsLogin && (
        <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">
          {t("loginAgain", { count: result.remaining })}
        </p>
      )}
      {result && result.sent > 0 && problems.length === 0 && (
        <p role="status" className="rounded-md border border-green-600 bg-green-100 p-2 text-sm text-green-900">
          {t("sent", { count: result.sent })}
        </p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="space-y-1 rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">
          {result!.sent > 0 && <p>{t("sentButNot", { count: result!.sent })}</p>}
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p.id}>{p.label}: {p.text}</li>
            ))}
          </ul>
          <Button variant="outline" className="min-h-9" onClick={() => setResult(null)}>{t("ok")}</Button>
        </div>
      )}
    </div>
  );
}
