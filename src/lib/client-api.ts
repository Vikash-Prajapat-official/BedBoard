"use client";

import { localizedError } from "./error-messages";
import { classifyResponse, createQueue, idbStore, type QueuedAction, type SendResult } from "./offline-queue";

/** `queued` is true when there was no network and the action was saved on this phone to send later. */
export type ApiResult<T = unknown> = { ok: true; data: T; queued?: boolean } | { ok: false; message: string; code?: string };

export const offlineQueue = createQueue(idbStore());
export const QUEUE_CHANGED = "bb-queue-changed";

/**
 * Calls the API. With `queue` (a label such as "Bed ICU-04"), a request that fails because the network
 * is down is kept in the offline queue together with the version it carried, instead of being lost.
 */
export async function callApi<T = unknown>(
  url: string,
  method: string,
  body?: unknown,
  opts: { queue?: string } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code: string | undefined = json?.error?.code;
      return { ok: false, code, message: localizedError(code, json?.error?.message ?? `Request failed (${res.status})`) };
    }
    return { ok: true, data: json as T };
  } catch {
    if (opts.queue && method === "POST") {
      try {
        await offlineQueue.enqueue({ url, method: "POST", body, label: opts.queue });
        window.dispatchEvent(new Event(QUEUE_CHANGED));
        return { ok: true, data: {} as T, queued: true };
      } catch {
        return { ok: false, code: "QUEUE_FAILED", message: localizedError("QUEUE_FAILED", "No connection, and this phone could not save the action. Try again.") };
      }
    }
    return { ok: false, code: "NETWORK", message: localizedError("NETWORK", "Network error. Check your connection and try again.") };
  }
}

/**
 * router.refresh() while the server is unreachable makes Next fall back to a full page load, which
 * lands on the browser's "no internet" page and loses the screen. Check we can reach the server first.
 */
export async function safeRefresh(router: { refresh: () => void }) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  try {
    await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(2500) });
  } catch {
    return;
  }
  router.refresh();
}

async function sendQueued(a: QueuedAction): Promise<SendResult> {
  try {
    const res = await fetch(a.url, {
      method: a.method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(a.body),
    });
    const json = await res.json().catch(() => ({}));
    return classifyResponse(res.status, json?.error?.message, json?.error?.code);
  } catch {
    return { kind: "retry" };
  }
}

/** Sends everything waiting in the offline queue, oldest first. */
export const replayOffline = () => offlineQueue.replay(sendQueued);
