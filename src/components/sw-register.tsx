"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (installable app, offline page). Browsers only allow service workers on
 * HTTPS or localhost, so on a plain http://192.168.x.x hospital network this quietly does nothing and the
 * rest of BedBoard works as normal (the offline queue and everything else do not need it).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
