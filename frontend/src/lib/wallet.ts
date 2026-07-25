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

export const HEDERA_TESTNET_CHAIN_ID = 296;
export const HEDERA_TESTNET_CHAIN_ID_HEX = "0x128";

/** Switches the connected wallet to Hedera Testnet, adding it first if the wallet doesn't know it yet. */
export async function ensureHederaTestnet(provider: EthereumProvider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HEDERA_TESTNET_CHAIN_ID_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    if (code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: HEDERA_TESTNET_CHAIN_ID_HEX,
          chainName: "Hedera Testnet",
          nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
          rpcUrls: ["https://testnet.hashio.io/api"],
          blockExplorerUrls: ["https://hashscan.io/testnet"],
        },
      ],
    });
  }
}

const KNOWN_CHAINS: Record<
  number,
  {
    chainIdHex: string;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  }
> = {
  1: {
    chainIdHex: "0x1",
    chainName: "Ethereum Mainnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://cloudflare-eth.com"],
    blockExplorerUrls: ["https://etherscan.io"],
  },
  8453: {
    chainIdHex: "0x2105",
    chainName: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  },
  11155111: {
    chainIdHex: "0xaa36a7",
    chainName: "Sepolia",
    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
  296: {
    chainIdHex: "0x128",
    chainName: "Hedera Testnet",
    nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
    rpcUrls: ["https://testnet.hashio.io/api"],
    blockExplorerUrls: ["https://hashscan.io/testnet"],
  },
};

/** Switches the connected wallet to the target chain ID, adding it first if unknown. */
export async function ensureChain(provider: EthereumProvider, chainId: number): Promise<void> {
  const chain = KNOWN_CHAINS[chainId];
  const chainIdHex = chain?.chainIdHex ?? `0x${chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    if (code !== 4902 || !chain) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chain.chainIdHex,
          chainName: chain.chainName,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls,
        },
      ],
    });
  }
}

export function explorerTxUrl(chainId: number | null, hash: string): string {
  if (chainId === 8453) return `https://basescan.org/tx/${hash}`;
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${hash}`;
  if (chainId === 296) return `https://hashscan.io/testnet/transaction/${hash}`;
  return `https://etherscan.io/tx/${hash}`;
}

export async function sendTransaction(
  provider: EthereumProvider,
  from: string,
  tx: { to: string; data?: string; value: string; gas?: string }
): Promise<string> {
  const isPlainTransfer = !tx.data || tx.data === "0x" || tx.data === "";
  // Hedera testnet JSON-RPC relay caps max gas limit per tx at 15,000,000 (0xe4e1c0).
  // Default to 21,000 (0x5208) for native HBAR/ETH transfers, or 2,000,000 (0x1e8480) for contract calls,
  // preventing wallets (e.g. MetaMask) from defaulting to 52.5M gas limit which Hedera rejects.
  const defaultGas = isPlainTransfer ? "0x5208" : "0x1e8480";
  const gas = tx.gas || defaultGas;

  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: tx.to, data: tx.data || "0x", value: tx.value, gas }],
  })) as string;
  return hash;
}
