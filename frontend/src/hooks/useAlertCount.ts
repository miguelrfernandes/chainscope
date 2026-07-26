"use client";

import { useEffect, useState } from "react";
import { fetchInboxSummary } from "@/lib/api";

function cacheKey(address: string): string {
  return `chainscope_cached_alert_count_${address.toLowerCase()}`;
}

/** Unread alert/run count for `address`, seeded from a localStorage cache
 * for an instant first paint, then refreshed from the API inbox summary. Recomputed
 * whenever `refreshDeps` changes (e.g. drawer open/close, new messages). */
export function useAlertCount(address: string | null, refreshDeps: readonly unknown[]): number {
  const [count, setCount] = useState<number>(() => {
    if (typeof window === "undefined" || !address) return 0;
    try {
      const cached = localStorage.getItem(cacheKey(address));
      if (cached !== null) {
        const parsed = parseInt(cached, 10);
        if (!isNaN(parsed)) return parsed;
      }
    } catch {}
    return 0;
  });

  useEffect(() => {
    let ignore = false;
    if (!address) return;

    try {
      const cached = localStorage.getItem(cacheKey(address));
      if (cached !== null) {
        const parsed = parseInt(cached, 10);
        if (!isNaN(parsed)) {
          queueMicrotask(() => {
            if (!ignore) setCount(parsed);
          });
        }
      }
    } catch {}

    fetchInboxSummary(address)
      .then((summary) => {
        if (!ignore) {
          const unread = summary.unread_count || 0;
          setCount(unread);
          try {
            localStorage.setItem(cacheKey(address), unread.toString());
          } catch {}
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, ...refreshDeps]);

  return count;
}
