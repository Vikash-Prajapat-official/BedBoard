"use client";

export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

export async function callApi<T = unknown>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: json?.error?.message ?? `Request failed (${res.status})` };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, message: "Network error. Check your connection and try again." };
  }
}
