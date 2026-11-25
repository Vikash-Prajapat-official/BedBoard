"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";
import { isIdle, parseTimestamp } from "@/lib/idle";

const LAST_ACTIVE = "bedboard-last-active";
const LOCKED = "bedboard-locked";

/**
 * Shared ward phones: after IDLE_LOGOUT_MINUTES without a touch the screen is covered. With a PIN set,
 * the user types the PIN to carry on; without one (or after too many wrong PINs) they are logged out.
 * The lock survives a reload. This protects an unattended phone from a passer-by; it is not a defence
 * against someone with developer tools, and the login session itself still ends after 12 hours.
 */
export function IdleLock({ idleMinutes, hasPin, logout }: { idleMinutes: number; hasPin: boolean; logout: () => Promise<void> }) {
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const lastActive = useRef<number>(Date.now());

  const leave = useCallback(() => {
    localStorage.removeItem(LOCKED);
    startTransition(() => void logout());
  }, [logout]);

  const lock = useCallback(() => {
    if (!hasPin) return leave(); // nothing to unlock with: log out
    localStorage.setItem(LOCKED, "1");
    setLocked(true);
  }, [hasPin, leave]);

  useEffect(() => {
    // A phone left overnight, or a tab that was asleep, is already past the limit when we load.
    const stored = parseTimestamp(localStorage.getItem(LAST_ACTIVE));
    if (localStorage.getItem(LOCKED) === "1" || isIdle(stored, Date.now(), idleMinutes)) lock();
    else lastActive.current = Date.now();

    let lastWrite = 0;
    const touch = () => {
      if (localStorage.getItem(LOCKED) === "1") return;
      const now = Date.now();
      lastActive.current = now;
      if (now - lastWrite > 5000) {
        lastWrite = now;
        localStorage.setItem(LAST_ACTIVE, String(now));
      }
    };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    touch();
    const timer = setInterval(() => {
      if (localStorage.getItem(LOCKED) === "1") return setLocked(true);
      if (isIdle(lastActive.current, Date.now(), idleMinutes)) lock();
    }, 10_000);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      clearInterval(timer);
    };
  }, [idleMinutes, lock]);

  async function unlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    const r = await callApi("/api/me/pin/verify", "POST", { pin: new FormData(form).get("pin") });
    setBusy(false);
    form.reset();
    if (r.ok) {
      localStorage.removeItem(LOCKED);
      lastActive.current = Date.now();
      localStorage.setItem(LAST_ACTIVE, String(lastActive.current));
      setLocked(false);
      router.refresh();
    } else if (/too many|log in/i.test(r.message) || /No PIN/i.test(r.message)) {
      leave(); // five wrong PINs, or the PIN was removed: use the password instead
    } else setError(r.message);
  }

  if (!locked) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Screen locked" className="fixed inset-0 z-50 flex items-center justify-center bg-white p-6">
      <form onSubmit={unlock} className="w-full max-w-xs space-y-4 text-center">
        <h2 className="text-xl font-bold text-blue-700">Locked</h2>
        <p className="text-sm text-slate-700">The screen locked because nobody touched it for {idleMinutes} minutes. Enter your PIN to carry on.</p>
        {error && <p role="alert" className="rounded-md border border-red-600 bg-red-100 p-2 text-sm text-red-900">{error}</p>}
        <Field label="4-digit PIN">
          <Input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoFocus autoComplete="off" className="text-center text-2xl tracking-widest" />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>Unlock</Button>
        <Button type="button" variant="outline" className="w-full" onClick={leave}>Log out and use my password</Button>
      </form>
    </div>
  );
}
