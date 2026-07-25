"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import createPlotlyComponent from "react-plotly.js/factory";
import { CHART_THEME } from "./theme";

const Plot = dynamic(
  async () => {
    const Plotly = await import("plotly.js-dist-min");
    return createPlotlyComponent(Plotly.default || Plotly);
  },
  { ssr: false }
);

export function PlotlyArtifact({ data }: { data: string }) {
  let parsed: { data?: unknown[]; layout?: Record<string, unknown> } = {};
  try {
    parsed = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return (
      <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-xs font-medium text-[var(--danger)]">
        ⚠️ Failed to render Plotly chart figure.
      </div>
    );
  }

  const figureData = Array.isArray(parsed.data) ? parsed.data : [];
  const backendLayout = (parsed.layout as Record<string, unknown>) || {};

  const layout = {
    ...backendLayout,
    autosize: true,
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: {
      color: CHART_THEME.inkDim,
      family: "var(--font-jetbrains), monospace",
      ...(typeof backendLayout.font === "object" ? backendLayout.font : {}),
    },
    colorway: CHART_THEME.colors,
    margin: {
      l: 40,
      r: 20,
      t: backendLayout.title ? 40 : 20,
      b: 40,
      ...(typeof backendLayout.margin === "object" ? backendLayout.margin : {}),
    },
    xaxis: {
      gridcolor: CHART_THEME.borderSoft,
      zerolinecolor: CHART_THEME.borderSoft,
      tickfont: { color: CHART_THEME.inkDim },
      ...(typeof backendLayout.xaxis === "object" ? backendLayout.xaxis : {}),
    },
    yaxis: {
      gridcolor: CHART_THEME.borderSoft,
      zerolinecolor: CHART_THEME.borderSoft,
      tickfont: { color: CHART_THEME.inkDim },
      ...(typeof backendLayout.yaxis === "object" ? backendLayout.yaxis : {}),
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d1210]/80 backdrop-blur-xl p-3 shadow-xl transition-all hover:border-white/20"
    >
      <Plot
        data={figureData as Plotly.Data[]}
        layout={layout as Partial<Plotly.Layout>}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: "100%", height: "100%", minHeight: "280px" }}
        useResizeHandler
      />
    </motion.div>
  );
}
