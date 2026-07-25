"use client";

import { useEffect, useState } from "react";
import type { Scenario } from "@/lib/scenarios";
import { FALLBACK_ANSWER } from "@/lib/scenarios";
import { AgentStatusList } from "./AgentStatusList";
import { StreamingAnswer } from "./StreamingAnswer";
import { MarkdownLite } from "./MarkdownLite";
import { BarChartArtifact } from "./BarChartArtifact";
import { LineChartArtifact } from "./LineChartArtifact";
import { DataTableArtifact } from "./DataTableArtifact";
import { HealthFactorGauge } from "./HealthFactorGauge";
import { SourcesRow } from "./SourcesRow";

type Phase = "steps" | "answer" | "reveal";

export function AssistantTurn({
  scenario,
  instant = false,
  onDone,
}: {
  scenario: Scenario | null;
  instant?: boolean;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(
    instant ? "reveal" : scenario ? "steps" : "answer"
  );

  useEffect(() => {
    if (phase === "reveal" && !instant) {
      const t = setTimeout(onDone, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (instant) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] leading-relaxed text-[var(--ink)]">
          <MarkdownLite text={scenario ? scenario.answer : FALLBACK_ANSWER} />
        </p>
        {scenario && (
          <div className="flex flex-col gap-3">
            {scenario.bar && <BarChartArtifact bar={scenario.bar} />}
            {scenario.line && <LineChartArtifact line={scenario.line} />}
            {scenario.healthFactor !== undefined && (
              <HealthFactorGauge value={scenario.healthFactor} />
            )}
            {scenario.table && <DataTableArtifact table={scenario.table} />}
            <SourcesRow sources={scenario.sources} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {scenario && phase === "steps" && (
        <AgentStatusList steps={scenario.steps} onDone={() => setPhase("answer")} />
      )}

      {phase !== "steps" && (
        <StreamingAnswer
          text={scenario ? scenario.answer : FALLBACK_ANSWER}
          onDone={() => setPhase("reveal")}
        />
      )}

      {phase === "reveal" && scenario && (
        <div className="flex flex-col gap-3">
          {scenario.bar && <BarChartArtifact bar={scenario.bar} />}
          {scenario.line && <LineChartArtifact line={scenario.line} />}
          {scenario.healthFactor !== undefined && (
            <HealthFactorGauge value={scenario.healthFactor} />
          )}
          {scenario.table && <DataTableArtifact table={scenario.table} />}
          <SourcesRow sources={scenario.sources} />
        </div>
      )}
    </div>
  );
}
