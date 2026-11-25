"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type State = "connecting" | "live" | "offline";

/**
 * Keeps the page current: listens to /api/stream and re-fetches the server data when a bed
 * changes. Pass wardId to react only to that ward. The label says it in words, not just colour.
 */
export function LiveRefresh({ wardId }: { wardId?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("connecting");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let opened = false;
    const es = new EventSource("/api/stream");
    // Several changes in a burst cause one refresh.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };

    es.onopen = () => {
      setState("live");
      if (opened) refresh(); // we may have missed events while disconnected
      opened = true;
    };
    es.onerror = () => setState("offline"); // EventSource retries by itself
    es.addEventListener("bed", (ev) => {
      try {
        const d = JSON.parse((ev as MessageEvent<string>).data) as { wardId?: string; kind?: string };
        if (!wardId || d.kind === "resync" || d.wardId === wardId) refresh();
      } catch {
        refresh();
      }
    });
    return () => {
      es.close();
      clearTimeout(timer);
    };
  }, [router, wardId]);

  const text = state === "live" ? "Live" : state === "offline" ? "Reconnecting…" : "Connecting…";
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
        state === "live" ? "border-green-600 bg-green-100 text-green-900" : "border-amber-600 bg-amber-100 text-amber-900"
      }`}
    >
      <span aria-hidden>{state === "live" ? "●" : "○"}</span> {text}
    </span>
  );
}
