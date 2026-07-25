"use client";

import { useCallback, useEffect, useState } from "react";
import { chainName, getEthereumProvider, shortenAddress } from "@/lib/wallet";

const SESSION_KEY_PREFIX = "chainscope:session:";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Session = { address: string; signature: string; signedAt: number };

function sessionKey(address: string): string {
  return SESSION_KEY_PREFIX + address.toLowerCase();
}

function loadSession(address: string): Session | null {
  try {
    const raw = localStorage.getItem(sessionKey(address));
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (Date.now() - session.signedAt > SESSION_TTL_MS) return null;
    return session;
  } catch {
    return null;
  }
}

function storeSession(session: Session) {
  try {
    localStorage.setItem(sessionKey(session.address), JSON.stringify(session));
  } catch {
    // best-effort — a rejected write just means we'll re-prompt for a signature next time
  }
}

function clearSession(address: string) {
  localStorage.removeItem(sessionKey(address));
}

export type WalletStatus =
  | "idle"
  | "connecting"
  | "signing"
  | "connected"
  | "unavailable"
  | "error";

export function useWallet() {
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disconnect = useCallback(() => {
    if (address) clearSession(address);
    setAddress(null);
    setChainId(null);
    setStatus("idle");
  }, [address]);

  const connect = useCallback(async () => {
    const provider = getEthereumProvider();
    if (!provider) {
      setStatus("unavailable");
      setError("No wallet extension detected — install MetaMask or another injected wallet.");
      return;
    }

    setError(null);
    setStatus("connecting");
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const account = accounts[0];
      if (!account) throw new Error("No account returned by wallet.");

      let session = loadSession(account);
      if (!session) {
        setStatus("signing");
        const message = `Sign in to ChainScope\n\nAddress: ${account}\nIssued: ${new Date().toISOString()}`;
        const signature = (await provider.request({
          method: "personal_sign",
          params: [message, account],
        })) as string;
        session = { address: account, signature, signedAt: Date.now() };
        storeSession(session);
      }

      const hexChainId = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(parseInt(hexChainId, 16));
      setAddress(account);
      setStatus("connected");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Wallet connection was rejected.");
    }
  }, []);

  // Silently restore a session on load if the site is already authorized and
  // holds an unexpired signature — no popup, no re-signing.
  useEffect(() => {
    const provider = getEthereumProvider();
    if (!provider) return;
    let cancelled = false;

    (async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        const account = accounts[0];
        if (!account || cancelled) return;
        const session = loadSession(account);
        if (!session) return;
        const hexChainId = (await provider.request({ method: "eth_chainId" })) as string;
        if (cancelled) return;
        setChainId(parseInt(hexChainId, 16));
        setAddress(account);
        setStatus("connected");
      } catch {
        // not auto-connectable — user can still connect manually
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const provider = getEthereumProvider();
    if (!provider) return;

    function handleAccountsChanged(...args: unknown[]) {
      const accounts = args[0] as string[];
      const account = accounts[0];
      if (!account) {
        disconnect();
        return;
      }
      const session = loadSession(account);
      if (session) {
        setAddress(account);
        setStatus("connected");
      } else {
        disconnect();
      }
    }

    function handleChainChanged(...args: unknown[]) {
      const hexChainId = args[0] as string;
      setChainId(parseInt(hexChainId, 16));
    }

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("chainChanged", handleChainChanged);
    };
  }, [disconnect]);

  return {
    status,
    address,
    chainId,
    error,
    connected: status === "connected" && !!address,
    short: address ? shortenAddress(address) : null,
    chainLabel: chainName(chainId),
    connect,
    disconnect,
  };
}
