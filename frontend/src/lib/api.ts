import type { AgentStep, Source } from "@/lib/scenarios";

export type BackendArtifact = { type: string; data: string };

export type ChatAnswer = {
  answer: string;
  sources: Source[];
  artifacts: BackendArtifact[];
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

type ChatHandlers = {
  onStep?: (step: AgentStep) => void;
  onAnswer?: (answer: ChatAnswer) => void;
  onError?: (message: string) => void;
};

function parseSseEvent(raw: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export async function streamChat(
  threadId: string,
  message: string,
  handlers: ChatHandlers,
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, message }),
      signal,
    });
  } catch {
    handlers.onError?.("Couldn't reach the ChainScope backend.");
    return;
  }

  if (!res.ok || !res.body) {
    handlers.onError?.(`Request failed (${res.status}).`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const event = parseSseEvent(rawEvent);
      if (!event) continue;

      try {
        const payload = JSON.parse(event.data);
        if (event.event === "step") handlers.onStep?.(payload);
        else if (event.event === "answer") handlers.onAnswer?.(payload);
        else if (event.event === "error") handlers.onError?.(payload.message);
      } catch {
        // malformed frame — skip it
      }
    }
  }
}
