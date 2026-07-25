"use client";

import { useCallback, useEffect, useState } from "react";
import { getHashConnect, getWalletConnectProjectId, type SessionData } from "@/lib/hederaWallet";

export type HederaWalletStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "unavailable"
  | "error";

export function useHederaWallet() {
  const [status, setStatus] = useState<HederaWalletStatus>("idle");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disconnect = useCallback(async () => {
    try {
      const hc = await getHashConnect();
      await hc.disconnect();
    } catch {
      // best-effort — clear local state regardless
    }
    setAccountId(null);
    setStatus("idle");
  }, []);

  const connect = useCallback(async () => {
    if (!getWalletConnectProjectId()) {
      setStatus("unavailable");
      setError("Hedera wallet connection isn't configured (missing WalletConnect project ID).");
      return;
    }

    setError(null);
    setStatus("connecting");
    try {
      const hc = await getHashConnect();
      if (hc.connectedAccountIds.length > 0) {
        setAccountId(hc.connectedAccountIds[0].toString());
        setStatus("connected");
        return;
      }
      await hc.openPairingModal();
      // Resolution happens via pairingEvent, handled in the effect below.
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Hedera wallet pairing was rejected.");
    }
  }, []);

  // Restore an already-paired session on load, and listen for new pairings
  // (the modal's pairing flow resolves asynchronously via this event, not
  // the connect() call above).
  useEffect(() => {
    if (!getWalletConnectProjectId()) return;
    let cancelled = false;

    function handlePairing(session: SessionData) {
      if (cancelled) return;
      const first = session.accountIds[0];
      if (!first) return;
      setAccountId(first);
      setStatus("connected");
      setError(null);
    }

    function handleDisconnection() {
      if (cancelled) return;
      setAccountId(null);
      setStatus("idle");
    }

    (async () => {
      try {
        const hc = await getHashConnect();
        if (cancelled) return;
        hc.pairingEvent.on(handlePairing);
        hc.disconnectionEvent.on(handleDisconnection);
        if (hc.connectedAccountIds.length > 0) {
          setAccountId(hc.connectedAccountIds[0].toString());
          setStatus("connected");
        }
      } catch {
        // not connectable — user can still hit "connect" for the real error
      }
    })();

    return () => {
      cancelled = true;
      getHashConnect()
        .then((hc) => {
          hc.pairingEvent.off(handlePairing);
          hc.disconnectionEvent.off(handleDisconnection);
        })
        .catch(() => {});
    };
  }, []);

  return {
    status,
    accountId,
    error,
    connected: status === "connected" && !!accountId,
    connect,
    disconnect,
  };
}
