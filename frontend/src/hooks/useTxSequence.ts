"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { getEthereumProvider, sendTransaction, type EthereumProvider } from "@/lib/wallet";

export type RunState = "idle" | "switching" | "confirming" | "broadcasting" | "done" | "error";

export type TxStep = {
  label?: string;
  to: string;
  data: string;
  value: string;
};

export type UseTxSequenceOptions = {
  steps: TxStep[];
  ensureChain: (provider: EthereumProvider) => Promise<void>;
  initialHashes?: string[];
  initialDone?: boolean;
  onComplete?: (hashes: string[]) => void;
};

export function useTxSequence({
  steps,
  ensureChain,
  initialHashes = [],
  initialDone = false,
  onComplete,
}: UseTxSequenceOptions) {
  const wallet = useWallet();
  const isInitialDone = Boolean(initialDone || (initialHashes && initialHashes.length > 0));
  const [state, setState] = useState<RunState>(isInitialDone ? "done" : "idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [hashes, setHashes] = useState<string[]>(initialHashes);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (state !== "idle" && state !== "error") return;
    const provider = getEthereumProvider();
    if (!provider || !wallet.address) {
      setError("Connect an EVM wallet first.");
      setState("error");
      return;
    }
    setError(null);
    try {
      setState("switching");
      await ensureChain(provider);

      const newHashes: string[] = [];
      for (let i = 0; i < steps.length; i++) {
        setStepIndex(i);
        setState("confirming");
        const hash = await sendTransaction(provider, wallet.address, {
          to: steps[i].to,
          data: steps[i].data,
          value: steps[i].value,
        });
        newHashes.push(hash);
        setHashes([...newHashes]);
        setState("broadcasting");
      }
      setState("done");
      onComplete?.(newHashes);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Transaction was rejected or failed.";
      setError(message);
      setState("error");
    }
  }

  return { state, stepIndex, hashes, error, run };
}
