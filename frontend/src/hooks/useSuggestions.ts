import { useEffect, useRef, useState } from "react";
import { fetchSuggestions, type ConversationTurn, type SuggestionItem } from "@/lib/api";

/**
 * Fetches 3 AI-generated follow-up suggestions (questions or actions) after
 * the conversation updates. Results are cached keyed by the number of turns
 * so we don't make redundant inference calls when switching conversations.
 *
 * - Returns `null` while a fetch is in-flight (caller shows a skeleton)
 * - Returns `[]` on error so callers degrade gracefully
 * - Skips the fetch when there are no turns or the last turn isn't a completed assistant reply
 */
export function useSuggestions(turns: ConversationTurn[]): SuggestionItem[] | null {
  const [suggestions, setSuggestions] = useState<SuggestionItem[] | null>(null);

  // Cache: key = turns.length → suggestions
  const cache = useRef<Map<number, SuggestionItem[]>>(new Map());
  // Track the key we last requested so we don't stack concurrent fetches
  const inflightKey = useRef<number | null>(null);

  const turnsLength = turns.length;
  const lastRole = turns[turnsLength - 1]?.role ?? null;
  const hasAnswer = Boolean(turns[turnsLength - 1]?.text);

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

    fetchSuggestions(turns, controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      cache.current.set(key, items);
      inflightKey.current = null;
      setSuggestions(items);
    });

    return () => {
      controller.abort();
      inflightKey.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnsLength, lastRole, hasAnswer]);

  return suggestions;
}
