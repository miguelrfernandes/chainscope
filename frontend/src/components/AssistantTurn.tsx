"use client";

import { useEffect, useState } from "react";
import type { Scenario } from "@/lib/scenarios";
import { FALLBACK_ANSWER } from "@/lib/scenarios";
import { AgentStatusList } from "./AgentStatusList";
import { StreamingAnswer } from "./StreamingAnswer";
import { BarChartArtifact } from "./BarChartArtifact";
import { LineChartArtifact } from "./LineChartArtifact";
import { DataTableArtifact } from "./DataTableArtifact";
import { HealthFactorGauge } from "./HealthFactorGauge";

type Phase = "steps" | "answer" | "artifacts";

export function AssistantTurn({
  scenario,
  onDone,
}: {
  scenario: Scenario | null;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(scenario ? "steps" : "answer");

  useEffect(() => {
    if (phase === "artifacts") {
      const t = setTimeout(onDone, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const hasArtifacts = !!(scenario?.bar || scenario?.line || scenario?.table || scenario?.healthFactor);

  return (
    <div className="flex flex-col gap-3">
      {scenario && phase === "steps" && (
        <AgentStatusList steps={scenario.steps} onDone={() => setPhase("answer")} />
      )}

      {phase !== "steps" && (
        <StreamingAnswer
          text={scenario ? scenario.answer : FALLBACK_ANSWER}
          onDone={() => {
            if (hasArtifacts) setPhase("artifacts");
            else onDone();
          }}
        />
      )}

      {phase === "artifacts" && scenario && (
        <div className="flex flex-col gap-3">
          {scenario.bar && <BarChartArtifact bar={scenario.bar} />}
          {scenario.line && <LineChartArtifact line={scenario.line} />}
          {scenario.healthFactor !== undefined && (
            <HealthFactorGauge value={scenario.healthFactor} />
          )}
          {scenario.table && <DataTableArtifact table={scenario.table} />}
        </div>
      )}
    </div>
  );
}
