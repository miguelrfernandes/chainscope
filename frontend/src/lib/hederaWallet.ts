/** HashConnect (HashPack) wallet integration — the Hedera equivalent of
 * lib/wallet.ts's window.ethereum helpers. Unlike the EVM wallet, HashConnect
 * is WalletConnect-based, so it needs a project ID (NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
 * free at https://cloud.reown.com) and an async pairing flow rather than a
 * synchronous injected provider. Used by hooks/useHederaWallet.ts and
 * components/HederaActionCard.tsx.
 *
 * `hashconnect`/`@hashgraph/sdk` are loaded via dynamic import(), not a
 * static top-level import: their WalletConnect dependency chain uses
 * dynamic `require()`s that Next.js's SSR prerender pass can't evaluate
 * ("dynamic usage of require is not supported"), even though this module is
 * only ever exercised client-side. Dynamic import defers loading to actual
 * call sites (connect/sign), which only run in the browser.
 */
import type { HashConnect, SessionData } from "hashconnect";

let instance: HashConnect | null = null;
let initPromise: Promise<HashConnect> | null = null;

function metadata() {
  return {
    name: "ChainScope",
    description: "Web3 analytics + action agents",
    icons: [`${window.location.origin}/icon.svg`],
    url: window.location.origin,
  };
}

export function getWalletConnectProjectId(): string | null {
  return process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || null;
}

/** Lazily creates and initializes the singleton HashConnect instance. */
export async function getHashConnect(): Promise<HashConnect> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  const projectId = getWalletConnectProjectId();
  if (!projectId) {
    throw new Error(
      "Hedera wallet connection needs NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (free at https://cloud.reown.com)."
    );
  }

  initPromise = (async () => {
    const { HashConnect: HashConnectClass } = await import("hashconnect");
    const { LedgerId } = await import("@hashgraph/sdk");
    const hc = new HashConnectClass(LedgerId.TESTNET, projectId, metadata(), false);
    await hc.init();
    instance = hc;
    return hc;
  })();

  return initPromise;
}

/** Decodes the hex-encoded `bytes_data` field from a Hedera Agent Kit
 * RETURN_BYTES tool response (see app/tools/hedera_actions.py) into an
 * unsigned Hedera Transaction ready for HashConnect to sign + execute. */
async function transactionFromHex(hex: string) {
  const { Transaction } = await import("@hashgraph/sdk");
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  return Transaction.fromBytes(bytes);
}

export type HederaReturnBytesPayload = {
  human_message: string;
  error: string | null;
  type: "return_bytes";
  bytes_data: string;
};

/** Signs and broadcasts an unsigned transaction via the paired HashPack
 * wallet, returning the Hedera transaction ID for a HashScan link.
 * `TransactionReceipt` doesn't carry the transaction ID itself, but the
 * frozen transaction already has one baked in by the backend (see
 * ReturnBytesStrategy.handle in the Agent Kit source) — read it before
 * sending, not from the receipt. */
export async function signAndExecute(accountId: string, hexBytes: string): Promise<string> {
  const [hc, { AccountId }, transaction] = await Promise.all([
    getHashConnect(),
    import("@hashgraph/sdk"),
    transactionFromHex(hexBytes),
  ]);
  const transactionId = transaction.transactionId?.toString() ?? "";
  await hc.sendTransaction(AccountId.fromString(accountId), transaction);
  return transactionId;
}

export async function signAndSendHbarTransfer(
  fromAccountId: string,
  toAccountId: string,
  amountHbar: number
): Promise<string> {
  const [hc, { AccountId, TransferTransaction, Hbar }] = await Promise.all([
    getHashConnect(),
    import("@hashgraph/sdk"),
  ]);
  const transaction = new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(fromAccountId), new Hbar(-amountHbar))
    .addHbarTransfer(AccountId.fromString(toAccountId), new Hbar(amountHbar));

  const transactionId = transaction.transactionId?.toString() ?? "";
  await hc.sendTransaction(AccountId.fromString(fromAccountId), transaction);
  return transactionId;
}

export type { SessionData };

