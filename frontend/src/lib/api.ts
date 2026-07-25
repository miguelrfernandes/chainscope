import type { AgentStep, Source } from "@/lib/scenarios";

export type BackendArtifact = { type: string; data: string };

export type ChatAnswer = {
  answer: string;
  sources: Source[];
  artifacts: BackendArtifact[];
};

function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!envUrl) return "http://localhost:8000";
  if (/^https?:\/\//i.test(envUrl)) return envUrl;
  return `https://${envUrl}`;
}

const API_BASE = getApiBaseUrl();

type ChatHandlers = {
  onStep?: (step: AgentStep) => void;
  onAnswer?: (answer: ChatAnswer) => void;
  onError?: (message: string) => void;
};

function parseSseEvent(raw: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith("event:")) {
      event = trimmed.slice(6).trim();
    } else if (trimmed.startsWith("data:")) {
      let dataVal = trimmed.slice(5);
      if (dataVal.startsWith(" ")) dataVal = dataVal.slice(1);
      dataLines.push(dataVal);
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export type StreamChatOptions = {
  signal?: AbortSignal;
  model?: "chainscope" | "0g";
};

export async function streamChat(
  threadId: string,
  message: string,
  handlers: ChatHandlers,
  optionsOrSignal?: AbortSignal | StreamChatOptions
): Promise<void> {
  const signal =
    optionsOrSignal instanceof AbortSignal ? optionsOrSignal : optionsOrSignal?.signal;
  const model =
    optionsOrSignal instanceof AbortSignal
      ? "chainscope"
      : optionsOrSignal?.model || "chainscope";

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: threadId, message, model }),
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

    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer)) !== null) {
      const sepIndex = match.index;
      const sepLength = match[0].length;
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + sepLength);
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

export async function confirmAgent(
  ownerAddress: string,
  agentName: string,
  txId: string
): Promise<{ status: string; agent: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/actions/confirm-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_address: ownerAddress,
      agent_name: agentName,
      tx_id: txId,
    }),
  });

  if (!res.ok) {
    let errMessage = `Confirmation failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.detail) errMessage = data.detail;
    } catch {
      // fallback
    }
    throw new Error(errMessage);
  }

  return res.json();
}

