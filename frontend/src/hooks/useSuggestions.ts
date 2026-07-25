import { useEffect, useRef, useState } from "react";
import { fetchSuggestions, type ConversationTurn } from "@/lib/api";

/**
 * Fetches 3 AI-generated follow-up questions after the conversation updates.
 * Results are cached keyed by the number of messages so we don't make redundant
 * inference calls when switching between already-loaded conversations.
 *
 * - Returns `null` while a fetch is in-flight (caller can show skeleton / spinner)
 * - Returns `[]` on error so callers degrade gracefully
 * - Skips the fetch entirely when `turns` is empty (empty state / new convo)
 */
export function useSuggestions(turns: ConversationTurn[]): string[] | null {
  const [suggestions, setSuggestions] = useState<string[] | null>(null);

  // Cache: key = turns.length → suggestions
  const cache = useRef<Map<number, string[]>>(new Map());
  // Track the key we last requested so we don't stack concurrent fetches
  const inflightKey = useRef<number | null>(null);

  const turnsLength = turns.length;
  const lastRole = turns[turnsLength - 1]?.role ?? null;
  const hasAnswer = turns[turnsLength - 1]?.text ? true : false;

  useEffect(() => {
    // No turns: nothing to suggest
    if (turnsLength === 0) return;

    // Only trigger once a completed assistant turn is the last message
    if (lastRole !== "assistant" || !hasAnswer) return;

    const key = turnsLength;

    if (cache.current.has(key)) {
      setSuggestions(cache.current.get(key)!);
      return;
    }

    if (inflightKey.current === key) return;

    const controller = new AbortController();
    inflightKey.current = key;

    // Show loading state async to avoid synchronous setState-in-effect
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) setSuggestions(null);
    });

    fetchSuggestions(turns, controller.signal).then((qs) => {
      if (controller.signal.aborted) return;
      cache.current.set(key, qs);
      inflightKey.current = null;
      setSuggestions(qs);
    });

    return () => {
      controller.abort();
      inflightKey.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnsLength, lastRole, hasAnswer]);

  return suggestions;
}

