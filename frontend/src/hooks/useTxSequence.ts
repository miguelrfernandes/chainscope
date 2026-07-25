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
};

export function useTxSequence({ steps, ensureChain }: UseTxSequenceOptions) {
  const wallet = useWallet();
  const [state, setState] = useState<RunState>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [hashes, setHashes] = useState<string[]>([]);
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
