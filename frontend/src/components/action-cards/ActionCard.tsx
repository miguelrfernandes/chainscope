"use client";

import React from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardBody, Button, Chip } from "@heroui/react";
import { useTxSequence, type TxStep } from "@/hooks/useTxSequence";
import { shortenAddressInText, type EthereumProvider } from "@/lib/wallet";

export type ChainStrategy = {
  ensureChain: (provider: EthereumProvider) => Promise<void>;
  explorerTxUrl: (hash: string, index: number) => string;
  explorerLabel?: (stepLabel: string | undefined, index: number) => string;
};

export type ActionCardProps = {
  strategy: ChainStrategy;
  eyebrow: string;
  subtitle: string;
  idleLabel?: string;
  humanMessage?: string;
  steps: TxStep[];
  switchingLabel?: string;
  children?: React.ReactNode;
};

export function ActionCard({
  strategy,
  eyebrow,
  subtitle,
  idleLabel,
  humanMessage,
  steps,
  switchingLabel,
  children,
}: ActionCardProps) {
  const { state, stepIndex, hashes, error, run } = useTxSequence({
    steps,
    ensureChain: strategy.ensureChain,
  });

  const isPending = state === "switching" || state === "confirming" || state === "broadcasting";
  const defaultIdle = steps.length > 1 ? "Execute Sequence" : "Send Transaction";
  const confirmingStepLabel = steps[stepIndex]?.label ?? `step ${stepIndex + 1}`;
  const shortConfirmingStepLabel =
    confirmingStepLabel.length > 28 ? `${confirmingStepLabel.slice(0, 25)}…` : confirmingStepLabel;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card
        radius="lg"
        shadow="md"
        className="rounded-2xl border border-white/10 bg-[#0d1210]/90 backdrop-blur-xl text-[var(--ink)] shadow-xl transition-all duration-400 hover:border-[var(--accent)]/40 hover:shadow-[0_16px_36px_-8px_rgba(0,0,0,0.6),0_0_25px_-2px_rgba(255,180,84,0.18)]"
      >
        <CardHeader className="flex items-center justify-between border-b border-white/10 px-5 py-3 rounded-t-2xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            {eyebrow}
          </span>
          <Chip
            size="sm"
            variant="flat"
            className="rounded-full border border-white/10 bg-white/5 text-[10px] text-[var(--ink-dim)] font-mono"
          >
            {subtitle}
          </Chip>
        </CardHeader>

        <CardBody className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
          <div className="flex min-w-0 flex-1 basis-0 flex-col gap-1">
            {children ? (
              children
            ) : (
              <>
                {humanMessage && (
                  <p className="text-sm font-medium leading-relaxed text-[var(--ink)] break-words">
                    {humanMessage}
                  </p>
                )}
                {steps.length > 1 && (
                  <p className="text-xs text-[var(--ink-faint)] font-mono">
                    ⚡ {steps.length} sequential steps required
                  </p>
                )}
              </>
            )}
          </div>

          {state === "done" ? (
            <div className="flex shrink-0 flex-col items-end gap-1.5 max-w-full min-w-0">
              {hashes.map((h, i) => {
                const defaultLabel =
                  steps.length === 1
                    ? "View on Explorer ↗"
                    : steps[i]?.label
                    ? shortenAddressInText(steps[i].label)
                    : `step ${i + 1}`;
                const labelText = strategy.explorerLabel
                  ? strategy.explorerLabel(steps[i]?.label, i)
                  : defaultLabel;
                return (
                  <motion.a
                    key={h}
                    href={strategy.explorerTxUrl(h, i)}
                    target="_blank"
                    rel="noreferrer"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="max-w-full truncate rounded-xl border border-[var(--success)]/40 bg-[var(--success)]/10 px-3.5 py-1.5 text-xs font-medium text-[var(--success)] transition hover:border-[var(--success)] hover:bg-[var(--success)]/20"
                  >
                    ✓ {labelText} · {h.slice(0, 8)}…
                  </motion.a>
                );
              })}
            </div>
          ) : (
            <motion.div
              className="w-full shrink-0 sm:w-auto"
              whileHover={{ scale: isPending ? 1 : 1.02 }}
              whileTap={{ scale: isPending ? 1 : 0.98 }}
            >
              <Button
                onClick={run}
                isDisabled={isPending}
                radius="full"
                size="md"
                className="h-auto w-full min-h-9 whitespace-normal break-words rounded-full border border-[var(--accent)] bg-[var(--accent)] px-5 py-2 text-center text-xs font-semibold leading-snug text-[var(--accent-ink)] shadow-[0_0_15px_rgba(255,180,84,0.2)] transition-all hover:bg-[var(--accent)]/90 hover:shadow-[0_0_25px_rgba(255,180,84,0.35)] disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:max-w-[220px]"
              >
                {state === "idle" && (idleLabel || defaultIdle)}
                {state === "switching" && (switchingLabel ?? "Switching network…")}
                {state === "confirming" && `Confirm in wallet — ${shortConfirmingStepLabel}`}
                {state === "broadcasting" && "Broadcasting tx…"}
                {state === "error" && "Retry Transaction"}
              </Button>
            </motion.div>
          )}
        </CardBody>

        {error && (
          <div className="border-t border-[var(--danger)]/30 bg-[var(--danger)]/5 px-5 py-2.5 text-xs font-medium text-[var(--danger)]">
            ⚠️ {error}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
