# Python sandbox

Agents need to turn subgraph query results (JSON, often nested/paginated)
into tables and charts. That work happens in a sandboxed Python execution
tool, not in the LLM's head.

## Shape of the tool

Exposed to LangGraph agents as a single tool, roughly:

```
run_python(code: str, dataframes: dict[str, ...] | None = None) -> {
  stdout: str,
  result: Any,          # last-expression value, JSON-serializable
  artifacts: list[str], # e.g. base64 PNGs or vega-lite/plotly JSON specs
}
```

- `dataframes` lets the calling agent hand in subgraph query results
  already coerced into pandas DataFrames, so the agent-written code can
  start from `df` instead of re-parsing raw GraphQL JSON.
- Available libraries: `pandas`, `numpy`, `matplotlib`/`plotly` for charts.
  Keep the set small and pinned — the agent's code-gen prompt should list
  exactly what's importable.
- Charts render as either a static image (matplotlib → PNG, base64) or a
  declarative spec (plotly/vega-lite JSON) the Next.js frontend can render
  natively. Prefer the declarative spec path where possible — it's cheaper
  to stream and renders interactively client-side.

## Isolation

Execution must be sandboxed — this runs LLM-generated code:

- Options (pick one for the hackathon, don't build a custom sandbox):
  a subprocess with restricted builtins + resource/time limits, or a
  hosted code-interpreter service (e.g. E2B, Modal sandboxes, or similar).
  Given the hackathon timeline, a hosted sandbox SDK is the pragmatic
  choice over hand-rolling process isolation.
- Enforce a wall-clock timeout (a few seconds) and no network access from
  inside the sandbox — all data comes in via `dataframes`, not by having
  the sandboxed code call out to The Graph itself.
- No filesystem persistence between calls; each `run_python` call is a
  fresh environment.

## Agent usage pattern

1. A data-fetching specialist (portfolio/DeFi/risk) gets results from the
   Subgraph MCP tool and normalizes them into a DataFrame.
2. It hands that DataFrame + a natural-language instruction ("plot balance
   over time") to the analyst/visualization step.
3. The analyst step prompts the LLM to write pandas/plotting code, executes
   it via `run_python`, and returns the artifact.
4. The orchestrator attaches the artifact to the final response.
