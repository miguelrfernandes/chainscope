import type { AgentStep, Source } from "@/lib/scenarios";
import type { BackendArtifact } from "@/lib/api";

export type StoredLiveState = {
  steps: AgentStep[];
  answer: string | null;
  sources: Source[];
  artifacts: BackendArtifact[];
  error: string | null;
};

export type StoredMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; live: StoredLiveState };

export type StoredThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: StoredMessage[];
};

const KEY_PREFIX = "chainscope:history:";
const MAX_THREADS = 50;

function storageKey(address: string): string {
  return KEY_PREFIX + address.toLowerCase();
}

export function loadThreads(address: string): StoredThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return [];
    const threads = JSON.parse(raw) as StoredThread[];
    return threads.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveThread(address: string, thread: StoredThread): StoredThread[] {
  const threads = loadThreads(address).filter((t) => t.id !== thread.id);
  threads.unshift(thread);
  const trimmed = threads.slice(0, MAX_THREADS);
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(trimmed));
  } catch {
    // storage full or unavailable — history is best-effort, fail silently
  }
  return trimmed;
}

export function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  if (diffMs <= 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days}d ago`;
  return new Date(timestampMs).toLocaleDateString();
}
