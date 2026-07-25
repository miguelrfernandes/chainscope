import { describe, expect, it } from "vitest";
import { SCENARIOS, HISTORY, FALLBACK_ANSWER } from "./scenarios";

describe("SCENARIOS end-to-end question verification", () => {
  it("contains all production demo scenarios with unique IDs and valid questions", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(5);

    const ids = new Set<string>();
    for (const scenario of SCENARIOS) {
      expect(scenario.id).toBeTruthy();
      expect(ids.has(scenario.id)).toBe(false);
      ids.add(scenario.id);

      expect(scenario.question).toBeTruthy();
      expect(typeof scenario.question).toBe("string");
      expect(scenario.question.length).toBeGreaterThan(10);

      expect(scenario.agent).toBeTruthy();
      expect(scenario.steps.length).toBeGreaterThan(0);
      expect(scenario.answer).toBeTruthy();
      expect(scenario.sources.length).toBeGreaterThan(0);

      // Verify each source has mandatory fields including query for provenance tooltip
      for (const source of scenario.sources) {
        expect(source.label).toBeTruthy();
        expect(source.id).toBeTruthy();
        expect(source.query).toBeTruthy();
      }

      // Verify artifacts have expected data structures if present
      if (scenario.bar) {
        expect(scenario.bar.title).toBeTruthy();
        expect(scenario.bar.data.length).toBeGreaterThan(0);
      }
      if (scenario.line) {
        expect(scenario.line.title).toBeTruthy();
        expect(scenario.line.data.length).toBeGreaterThan(0);
      }
      if (scenario.table) {
        expect(scenario.table.title).toBeTruthy();
        expect(scenario.table.columns.length).toBeGreaterThan(0);
        expect(scenario.table.rows.length).toBeGreaterThan(0);
      }
      if (scenario.actions) {
        expect(scenario.actions.length).toBeGreaterThan(0);
        for (const action of scenario.actions) {
          expect(action.id).toBeTruthy();
          expect(action.label).toBeTruthy();
          expect(action.cta).toBeTruthy();
        }
      }
    }
  });

  it("exports HISTORY matching SCENARIOS with relative time labels", () => {
    expect(HISTORY.length).toBe(SCENARIOS.length);
    for (let i = 0; i < SCENARIOS.length; i++) {
      expect(HISTORY[i].scenario).toBe(SCENARIOS[i]);
      expect(HISTORY[i].agoLabel).toBeTruthy();
    }
  });

  it("provides a clear FALLBACK_ANSWER string", () => {
    expect(FALLBACK_ANSWER).toBeTruthy();
    expect(typeof FALLBACK_ANSWER).toBe("string");
  });
});
