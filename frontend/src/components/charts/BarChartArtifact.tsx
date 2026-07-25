"use client";

import { motion } from "framer-motion";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import type { Scenario } from "@/lib/scenarios";
import { ProvenanceTag } from "../ProvenanceTag";
import { CHART_THEME } from "./theme";

export function BarChartArtifact({ bar }: { bar: NonNullable<Scenario["bar"]> }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-white/10 bg-[#0d1210]/80 backdrop-blur-xl p-5 shadow-xl transition-all hover:border-white/20"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-dim)]">
          {bar.title}
        </p>
        <ProvenanceTag icon="⌁">python · pandas</ProvenanceTag>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bar.data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: CHART_THEME.border }}
              tick={{ fill: CHART_THEME.inkDim, fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART_THEME.inkDim, fontSize: 11 }}
              tickFormatter={(v) => `${bar.unit}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#131313",
                borderColor: "rgba(255, 255, 255, 0.12)",
                borderRadius: "12px",
                boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
                color: CHART_THEME.ink,
                fontSize: "12px",
                padding: "8px 12px",
              }}
              formatter={(val) => [`${bar.unit}${Number(val ?? 0).toLocaleString()}`, "Value"]}
              labelStyle={{ color: CHART_THEME.inkDim, fontWeight: 600, marginBottom: "4px" }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {bar.data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || CHART_THEME.colors[index % CHART_THEME.colors.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
