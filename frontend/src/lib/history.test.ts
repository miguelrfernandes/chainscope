import { describe, expect, it, beforeEach, vi } from "vitest";
import { formatRelativeTime, loadThreads, saveThread, type StoredThread } from "./history";

describe("history module", () => {
  const mockAddress = "0x1234567890abcdef1234567890abcdef12345678";

  beforeEach(() => {
    const store = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      clear: () => store.clear(),
      removeItem: (key: string) => store.delete(key),
    };
    vi.stubGlobal("window", { localStorage: localStorageMock });
    vi.stubGlobal("localStorage", localStorageMock);
  });

  describe("formatRelativeTime", () => {
    it("returns 'just now' for recent timestamps", () => {
      const now = Date.now();
      expect(formatRelativeTime(now)).toBe("just now");
      expect(formatRelativeTime(now - 10_000)).toBe("just now");
      expect(formatRelativeTime(now - 59_000)).toBe("just now");
      expect(formatRelativeTime(now + 5000)).toBe("just now");
    });

    it("formats minutes ago correctly", () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 60_000)).toBe("1m ago");
      expect(formatRelativeTime(now - 5 * 60_000)).toBe("5m ago");
      expect(formatRelativeTime(now - 59 * 60_000)).toBe("59m ago");
    });

    it("formats hours ago correctly", () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 60 * 60_000)).toBe("1h ago");
      expect(formatRelativeTime(now - 3 * 60 * 60_000)).toBe("3h ago");
      expect(formatRelativeTime(now - 23 * 60 * 60_000)).toBe("23h ago");
    });

    it("formats days and yesterday correctly", () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 24 * 60 * 60_000)).toBe("yesterday");
      expect(formatRelativeTime(now - 2 * 24 * 60 * 60_000)).toBe("2d ago");
      expect(formatRelativeTime(now - 6 * 24 * 60 * 60_000)).toBe("6d ago");
    });

    it("formats older timestamps as localized date string", () => {
      const past = new Date(2025, 0, 1).getTime();
      expect(formatRelativeTime(past)).toBe(new Date(past).toLocaleDateString());
    });
  });

  describe("loadThreads and saveThread", () => {
    it("returns empty array if no threads are saved", () => {
      expect(loadThreads(mockAddress)).toEqual([]);
    });

    it("saves and loads threads sorted by updatedAt descending", () => {
      const thread1: StoredThread = {
        id: "t1",
        title: "First thread",
        updatedAt: 1000,
        messages: [{ role: "user", text: "Hello" }],
      };
      const thread2: StoredThread = {
        id: "t2",
        title: "Second thread",
        updatedAt: 2000,
        messages: [{ role: "user", text: "World" }],
      };

      saveThread(mockAddress, thread1);
      saveThread(mockAddress, thread2);

      const loaded = loadThreads(mockAddress);
      expect(loaded.length).toBe(2);
      expect(loaded[0].id).toBe("t2");
      expect(loaded[1].id).toBe("t1");
    });

    it("updates an existing thread and moves it to the top", () => {
      const thread1: StoredThread = {
        id: "t1",
        title: "First thread",
        updatedAt: 1000,
        messages: [{ role: "user", text: "Hello" }],
      };
      const thread2: StoredThread = {
        id: "t2",
        title: "Second thread",
        updatedAt: 2000,
        messages: [{ role: "user", text: "World" }],
      };

      saveThread(mockAddress, thread1);
      saveThread(mockAddress, thread2);

      const updatedThread1: StoredThread = {
        ...thread1,
        updatedAt: 3000,
      };
      saveThread(mockAddress, updatedThread1);

      const loaded = loadThreads(mockAddress);
      expect(loaded.length).toBe(2);
      expect(loaded[0].id).toBe("t1");
      expect(loaded[0].updatedAt).toBe(3000);
      expect(loaded[1].id).toBe("t2");
    });
  });
});
