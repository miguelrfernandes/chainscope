"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ScenarioAction } from "@/lib/scenarios";
import { AaveMark, HederaMark, UniswapMark } from "@/components/IntegrationIcons";

type TxState = "idle" | "confirming" | "pending" | "done";

const HEX = "0123456789abcdef";

function fakeEvmTxHash() {
  let hash = "0x";
  for (let i = 0; i < 64; i++) hash += HEX[Math.floor(Math.random() * 16)];
  return hash;
}

function fakeHederaTxId(protocol: string) {
  const accountMatch = protocol.match(/0\.0\.\d+/);
  const account = accountMatch ? accountMatch[0] : `0.0.${1000 + Math.floor(Math.random() * 900000)}`;
  const seconds = Math.floor(Date.now() / 1000);
  const nanos = Math.floor(Math.random() * 999999999)
    .toString()
    .padStart(9, "0");
  return `${account}-${seconds}-${nanos}`;
}

function isHedera(protocol: string) {
  return /hedera/i.test(protocol);
}

function ProtocolMark({ protocol }: { protocol: string }) {
  if (/hedera/i.test(protocol)) return <HederaMark className="h-full w-full object-contain" />;
  if (/uniswap/i.test(protocol)) return <UniswapMark className="h-full w-full object-contain" />;
  if (/aave/i.test(protocol)) return <AaveMark className="h-full w-full object-contain" />;
  return null;
}

export function SuggestedActions({ actions }: { actions: ScenarioAction[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-raised)]/60 backdrop-blur-xl shadow-xl transition-all duration-300 hover:border-[var(--accent)]/30"
    >
      <div className="flex items-baseline justify-between border-b border-[var(--border)] px-5 py-3 bg-white/5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
          Suggested actions
        </p>
        <p className="text-[10px] font-mono text-[var(--ink-faint)]">
          simulated — no funds move
        </p>
      </div>
      <div className="flex flex-col divide-y divide-[var(--border-soft)]">
        {actions.map((a) => (
          <ActionRow key={a.id} action={a} />
        ))}
      </div>
    </motion.div>
  );
}

function ActionRow({ action }: { action: ScenarioAction }) {
  const [state, setState] = useState<TxState>("idle");
  const [hash, setHash] = useState("");
  const hedera = isHedera(action.protocol);

  function run() {
    if (state !== "idle") return;
    setState("confirming");
    setTimeout(() => {
      setState("pending");
      setTimeout(() => {
        setHash(hedera ? fakeHederaTxId(action.protocol) : fakeEvmTxHash());
        setState("done");
      }, 1100);
    }, 900);
  }

  const explorerHref = hedera
    ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(hash)}`
    : `https://etherscan.io/tx/${hash}`;
  const explorerLabel = hedera ? `${hash.split("-")[0]}…` : `${hash.slice(0, 10)}…`;

  return (
    <div className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between min-w-0 transition-colors hover:bg-white/[0.02]">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-soft)] bg-white/5 p-1.5">
          <ProtocolMark protocol={action.protocol} />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink)]">{action.label}</span>
            {action.value && (
              <span className="text-xs font-mono font-semibold text-[var(--success)]">
                {action.value}
              </span>
            )}
          </div>
          <p className="max-w-md text-xs leading-relaxed text-[var(--ink-dim)]">{action.description}</p>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-faint)]">
            {action.protocol}
          </span>
        </div>
      </div>

      {state === "done" ? (
        <motion.a
          href={explorerHref}
          target="_blank"
          rel="noreferrer"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="shrink-0 max-w-full text-center rounded-xl border border-[var(--success)]/40 bg-[var(--success)]/10 px-3.5 py-1.5 text-xs font-medium text-[var(--success)] transition-all hover:border-[var(--success)] hover:bg-[var(--success)]/20"
        >
          ✓ confirmed · {explorerLabel}
        </motion.a>
      ) : (
        <motion.button
          onClick={run}
          disabled={state !== "idle"}
          whileHover={{ scale: state === "idle" ? 1.04 : 1 }}
          whileTap={{ scale: state === "idle" ? 0.96 : 1 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 max-w-full text-center rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-[var(--accent-ink)] shadow-[0_0_15px_rgba(255,180,84,0.2)] transition-all hover:bg-[var(--accent)]/90 hover:shadow-[0_0_22px_rgba(255,180,84,0.4)] disabled:cursor-wait disabled:opacity-70"
        >
          {state === "idle" && action.cta}
          {state === "confirming" && "confirm in wallet…"}
          {state === "pending" && "broadcasting…"}
        </motion.button>
      )}
    </div>
  );
}

