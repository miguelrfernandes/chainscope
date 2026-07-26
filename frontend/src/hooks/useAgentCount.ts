"use client";

import { useEffect, useState } from "react";
import { fetchUserAgents } from "@/lib/api";

function cacheKey(address: string): string {
  return `chainscope_cached_agents_${address.toLowerCase()}`;
}

/** Non-archived agent count for `address`, seeded from a localStorage cache
 * for an instant first paint, then refreshed from the API. Recomputed
 * whenever `refreshDeps` changes (e.g. drawer open/close, new messages). */
export function useAgentCount(address: string | null, refreshDeps: readonly unknown[]): number {
  const [count, setCount] = useState<number>(() => {
    if (typeof window === "undefined" || !address) return 0;
    try {
      const cached = localStorage.getItem(cacheKey(address));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {}
    return 0;
  });

  useEffect(() => {
    let ignore = false;
    if (!address) return;

    try {
      const cached = localStorage.getItem(cacheKey(address));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const cachedCount = parsed.filter((a: { status?: string }) => a.status !== "ARCHIVED").length;
          queueMicrotask(() => {
            if (!ignore) setCount(cachedCount);
          });
        }
      }
    } catch {}

    fetchUserAgents(address)
      .then((agents) => {
        if (!ignore) {
          setCount(agents.filter((a) => a.status !== "ARCHIVED").length);
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
