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

export const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/** Switches the connected wallet to Sepolia, adding it first if the wallet doesn't know it yet. */
export async function ensureSepolia(provider: EthereumProvider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    if (code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: SEPOLIA_CHAIN_ID_HEX,
          chainName: "Sepolia",
          nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        },
      ],
    });
  }
}

export async function sendTransaction(
  provider: EthereumProvider,
  from: string,
  tx: { to: string; data: string; value: string }
): Promise<string> {
  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: tx.to, data: tx.data, value: tx.value }],
  })) as string;
  return hash;
}
