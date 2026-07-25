export type EthereumRequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export type EthereumProvider = {
  request: (args: EthereumRequestArgs) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  11155111: "Sepolia",
};

export function chainName(chainId: number | null): string {
  if (chainId === null) return "unknown chain";
  return CHAIN_NAMES[chainId] ?? `chain ${chainId}`;
}
