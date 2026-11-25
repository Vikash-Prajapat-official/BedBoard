"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QUEUE_CHANGED, offlineQueue, replayOffline, safeRefresh } from "@/lib/client-api";
import type { ReplayResult } from "@/lib/offline-queue";

/**
 * Shows what is waiting in the offline queue and replays it when the network is back.
 * A stale action (the bed changed meanwhile) is not applied; the nurse is told "Bed changed, please refresh".
 */
export function OfflineSync() {
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
    const t = setInterval(() => void sync(), 20_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(QUEUE_CHANGED, onChange);
      clearInterval(t);
    };
  }, [count, sync]);

  // The "all sent" note fades by itself; problems stay until dismissed.
  useEffect(() => {
    if (!result || result.conflicts.length || result.rejected.length || result.needsLogin) return;
    const t = setTimeout(() => setResult(null), 5000);
    return () => clearTimeout(t);
  }, [result]);

  const problems = result ? [...result.conflicts, ...result.rejected] : [];
  return (
    <div className="space-y-2" aria-live="polite">
      {(!online || pending > 0) && (
        <p role="status" className="rounded-md border border-amber-600 bg-amber-100 p-2 text-sm text-amber-900">
          <strong>{online ? "Sending…" : "Offline."}</strong>{" "}
          {pending > 0
            ? `${pending} action${pending === 1 ? " is" : "s are"} saved on this phone and will be sent when you are connected.`
            : "You can keep working; your taps will be saved on this phone."}
        </p>
      )}
      {result?.needsLogin && (
        <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">
          Please log in again. {result.remaining} saved action{result.remaining === 1 ? "" : "s"} will be sent after that.
        </p>
      )}
      {result && result.sent > 0 && problems.length === 0 && (
        <p role="status" className="rounded-md border border-green-600 bg-green-100 p-2 text-sm text-green-900">
          {result.sent} saved action{result.sent === 1 ? " was" : "s were"} sent.
        </p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="space-y-1 rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">
          {result!.sent > 0 && <p>{result!.sent} saved action{result!.sent === 1 ? " was" : "s were"} sent. These were not:</p>}
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p.action.id}>{p.action.label}: {p.message}</li>
            ))}
          </ul>
          <Button variant="outline" className="min-h-9" onClick={() => setResult(null)}>OK</Button>
        </div>
      )}
    </div>
  );
}
