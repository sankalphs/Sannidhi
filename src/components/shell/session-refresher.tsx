"use client";

import { useEffect } from "react";

/**
 * Silently renews a full session cookie when its server-side session is about
 * to expire (the refresh route only renews inside the last 24h window and
 * only while the Convex session is still active). Runs on an interval so a
 * long-lived tab never bounces mid-class; failures are best-effort and
 * retried on the next tick.
 */

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export function SessionRefresher() {
  useEffect(() => {
    const refresh = () => {
      void fetch("/api/auth/session/refresh", { method: "POST" }).catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return null;
}
