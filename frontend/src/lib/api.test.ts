import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmAgent,
  deleteScheduledJob,
  fetchScheduledJobs,
  fetchUserAgents,
  streamChat,
} from "./api";

function sseResponse(frames: string[], { chunkSize = Infinity } = {}) {
  const body = frames.join("");
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChat", () => {
  it("dispatches step and answer events in order", async () => {
    const frames = [
      `event: step\ndata: ${JSON.stringify({ agent: "Orchestrator", text: "Routing..." })}\n\n`,
      `event: step\ndata: ${JSON.stringify({ agent: "DeFi research agent", text: "Querying..." })}\n\n`,
      `event: answer\ndata: ${JSON.stringify({
        answer: "86% utilization.",
        sources: [{ label: "src", id: "sub/1", query: "{ ... }" }],
        artifacts: [{ type: "image/png", data: "abc123" }],
      })}\n\n`,
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const steps: unknown[] = [];
    let answer: unknown = null;
    let error: unknown = null;

    await streamChat("t1", "hi", {
      onStep: (s) => steps.push(s),
      onAnswer: (a) => (answer = a),
      onError: (e) => (error = e),
    });

    expect(steps).toEqual([
      { agent: "Orchestrator", text: "Routing..." },
      { agent: "DeFi research agent", text: "Querying..." },
    ]);
    expect(answer).toEqual({
      answer: "86% utilization.",
      sources: [{ label: "src", id: "sub/1", query: "{ ... }" }],
      artifacts: [{ type: "image/png", data: "abc123" }],
    });
    expect(error).toBeNull();
  });

  it("handles SSE data lines with spaces or trailing carriage returns (sse_starlette format)", async () => {
    const frames = [
      "event: step\r\ndata: {\"agent\":\"Orchestrator\",\"text\":\"Routing to portfolio...\"}\r\n\r\n",
      "event: answer\r\ndata: {\"answer\":\"Hello!\",\"sources\":[],\"artifacts\":[]}\r\n\r\n",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const steps: unknown[] = [];
    let answer: unknown = null;

    await streamChat("t1", "hi", {
      onStep: (s) => steps.push(s),
      onAnswer: (a) => (answer = a),
    });

    expect(steps).toEqual([{ agent: "Orchestrator", text: "Routing to portfolio..." }]);
    expect(answer).toEqual({ answer: "Hello!", sources: [], artifacts: [] });
  });

  it("reassembles SSE frames split across network chunks", async () => {
    const frames = [
      `event: answer\ndata: ${JSON.stringify({ answer: "hi", sources: [], artifacts: [] })}\n\n`,
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames, { chunkSize: 5 })));

    let answer: unknown = null;
    await streamChat("t1", "hi", { onAnswer: (a) => (answer = a) });

    expect(answer).toEqual({ answer: "hi", sources: [], artifacts: [] });
  });

  it("surfaces a backend-sent error event", async () => {
    const frames = [`event: error\ndata: ${JSON.stringify({ message: "subgraph timed out" })}\n\n`];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    let error: unknown = null;
    let answer: unknown = null;
    await streamChat("t1", "hi", {
      onError: (e) => (error = e),
      onAnswer: (a) => (answer = a),
    });

    expect(error).toBe("subgraph timed out");
    expect(answer).toBeNull();
  });

  it("reports an error when the request fails outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    );

    let error: unknown = null;
    await streamChat("t1", "hi", { onError: (e) => (error = e) });

    expect(error).toBe("Request failed (500).");
  });

  it("reports an error when the network request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

    let error: unknown = null;
    await streamChat("t1", "hi", { onError: (e) => (error = e) });

    expect(error).toBe("Couldn't reach the ChainScope backend.");
  });
});

describe("confirmAgent", () => {
  it("posts to /api/actions/confirm-agent and returns parsed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ACTIVE", agent: { agent_name: "test-bot" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const result = await confirmAgent("0xowner", "test-bot", "0.0.1001@123.456");
    expect(result).toEqual({ status: "ACTIVE", agent: { agent_name: "test-bot" } });
  });

  it("throws error with detail message on non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Transaction failed" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(confirmAgent("0xowner", "test-bot", "0.0.1001@123.456")).rejects.toThrow(
      "Transaction failed"
    );
  });
});

describe("agent and scheduler API helpers", () => {
  it("fetches user agents", async () => {
    const mockAgents = [
      {
        agent_name: "yield-bot",
        account_id: "0.0.1001",
        evm_address: "0x123",
        status: "ACTIVE",
        balance_hbar: 10,
        created_at: "2026-07-25T00:00:00Z",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockAgents), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const res = await fetchUserAgents("0xowner");
    expect(res).toEqual(mockAgents);
  });

  it("fetches scheduled jobs and deletes job", async () => {
    const mockJobs = [
      {
        job_id: "job-1",
        id: "job-1",
        name: "run_scheduled_rebalance",
        next_run_time: "2026-07-26T00:00:00Z",
        trigger: "cron[0 0 * * *]",
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockJobs), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "success", job_id: "job-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const jobs = await fetchScheduledJobs();
    expect(jobs).toEqual(mockJobs);

    await deleteScheduledJob("job-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});


