export type AgentStep = {
  agent: string;
  text: string;
};

export type Source = { label: string; id: string };
export type BarDatum = { label: string; value: number; color: string };
export type LineDatum = { label: string; value: number };
export type TableRow = Record<string, string>;

export type Scenario = {
  id: string;
  question: string;
  agent: string;
  steps: AgentStep[];
  answer: string;
  sources: Source[];
  bar?: { title: string; unit: string; data: BarDatum[] };
  line?: { title: string; unit: string; data: LineDatum[] };
  table?: { title: string; columns: string[]; rows: TableRow[] };
  healthFactor?: number;
};

export const ACCOUNT = {
  label: "demo wallet",
  address: "0x8f2a19b4d3f0c9a17e6b2d4c8a5f31e0b6c7c91b",
  short: "0x8f2a…c91b",
  chains: ["Ethereum", "Arbitrum"],
};

export const SCENARIOS: Scenario[] = [
  {
    id: "portfolio",
    question: "What's my portfolio breakdown across chains right now?",
    agent: "Portfolio agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Portfolio agent..." },
      {
        agent: "Portfolio agent",
        text: "Querying wallet balances subgraph on Ethereum via Subgraph MCP...",
      },
      {
        agent: "Portfolio agent",
        text: "Querying wallet balances subgraph on Arbitrum via Subgraph MCP...",
      },
      {
        agent: "Analyst agent",
        text: "Aggregating balances with pandas, computing USD values...",
      },
    ],
    answer:
      "Your wallet (0x8f2a...c91b) currently holds **$48,320** across 2 chains. Ethereum mainnet accounts for 71% of holdings, mostly ETH and staked ETH, while Arbitrum holds the rest, largely in USDC and ARB. Your largest single position is 6.2 ETH ($21,750).",
    sources: [
      { label: "Wallet balances — Ethereum", id: "messari/erc20-balances-ethereum" },
      { label: "Wallet balances — Arbitrum", id: "messari/erc20-balances-arbitrum" },
    ],
    bar: {
      title: "Holdings by asset (USD)",
      unit: "$",
      data: [
        { label: "ETH", value: 21750, color: "#ffb454" },
        { label: "stETH", value: 6800, color: "#e8935c" },
        { label: "USDC", value: 12100, color: "#6fe3a1" },
        { label: "ARB", value: 4200, color: "#ff8a5c" },
        { label: "Other", value: 3470, color: "#5c6862" },
      ],
    },
    table: {
      title: "Positions",
      columns: ["Chain", "Asset", "Amount", "USD Value"],
      rows: [
        { Chain: "Ethereum", Asset: "ETH", Amount: "6.2", "USD Value": "$21,750" },
        { Chain: "Ethereum", Asset: "stETH", Amount: "2.1", "USD Value": "$6,800" },
        { Chain: "Arbitrum", Asset: "USDC", Amount: "12,100", "USD Value": "$12,100" },
        { Chain: "Arbitrum", Asset: "ARB", Amount: "3,800", "USD Value": "$4,200" },
        { Chain: "Ethereum", Asset: "Other tokens", Amount: "—", "USD Value": "$3,470" },
      ],
    },
  },
  {
    id: "defi-research",
    question: "What's the current utilization and supply APY on Aave v3 USDC?",
    agent: "DeFi research agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to DeFi research agent..." },
      {
        agent: "DeFi research agent",
        text: "Querying Aave v3 Ethereum subgraph via Subgraph MCP (reserve: USDC)...",
      },
      {
        agent: "DeFi research agent",
        text: "Fetching 7-day historical utilization snapshots...",
      },
      {
        agent: "Analyst agent",
        text: "Plotting utilization trend with pandas...",
      },
    ],
    answer:
      "Aave v3 USDC on Ethereum is currently at **86.4% utilization**, with a supply APY of **4.9%** and variable borrow APY of **6.7%**. Utilization has climbed steadily over the past week, up from 79% — worth watching if you're supplying, since APY tends to spike further as utilization approaches the reserve's optimal threshold (90%).",
    sources: [
      { label: "Aave v3 Ethereum — reserves", id: "aave/protocol-v3-ethereum" },
    ],
    line: {
      title: "USDC reserve utilization, last 7 days",
      unit: "%",
      data: [
        { label: "Mon", value: 79 },
        { label: "Tue", value: 80.5 },
        { label: "Wed", value: 81 },
        { label: "Thu", value: 83 },
        { label: "Fri", value: 84.2 },
        { label: "Sat", value: 85 },
        { label: "Sun", value: 86.4 },
      ],
    },
  },
  {
    id: "risk-monitor",
    question: "Am I close to liquidation on my Aave position?",
    agent: "Risk monitor agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Risk monitor agent..." },
      {
        agent: "Risk monitor agent",
        text: "Querying your Aave v3 user position subgraph via Subgraph MCP...",
      },
      {
        agent: "Risk monitor agent",
        text: "Computing health factor from collateral and debt...",
      },
    ],
    answer:
      "Your Aave v3 position has a **health factor of 1.34**. You've supplied $32,000 in stETH as collateral against a $19,200 USDC borrow. You're not in immediate danger, but a ~26% drop in stETH price would push your health factor below 1.0 and risk liquidation. Consider adding collateral or repaying part of the loan if you expect volatility.",
    sources: [
      { label: "Aave v3 Ethereum — user positions", id: "aave/protocol-v3-ethereum" },
    ],
    healthFactor: 1.34,
  },
  {
    id: "governance",
    question: "Summarize the active Uniswap governance proposals.",
    agent: "Governance agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Governance agent..." },
      {
        agent: "Governance agent",
        text: "Querying Uniswap governance subgraph via Subgraph MCP...",
      },
      {
        agent: "Governance agent",
        text: "Fetching proposal descriptions and current vote tallies...",
      },
    ],
    answer:
      "There are **2 active proposals**. UGP-42 (\"Deploy fee switch on 5 additional pools\") is passing with 68% For and quorum already met, voting closes in 3 days. UGP-43 (\"Grant $400k from the treasury to the v4 hooks incubator\") is closer, at 54% For with quorum not yet reached — it needs about 1.1M more UNI in turnout to be binding by the time voting ends in 5 days.",
    sources: [
      { label: "Uniswap governance — proposals & votes", id: "uniswap/governance-v2" },
    ],
    table: {
      title: "Active proposals",
      columns: ["Proposal", "Status", "For", "Quorum", "Ends"],
      rows: [
        { Proposal: "UGP-42 — Fee switch, 5 pools", Status: "Passing", For: "68%", Quorum: "met", Ends: "3d" },
        { Proposal: "UGP-43 — v4 hooks incubator grant", Status: "At risk", For: "54%", Quorum: "not met", Ends: "5d" },
      ],
    },
  },
  {
    id: "trading",
    question: "Is there enough USDC/ETH liquidity on Uniswap to swap $250k without much slippage?",
    agent: "Trading agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Trading agent..." },
      {
        agent: "Trading agent",
        text: "Querying Uniswap v3 Ethereum subgraph via Subgraph MCP (pool: USDC/ETH 0.05%)...",
      },
      {
        agent: "Trading agent",
        text: "Paying per-query via x402 for a deeper tick-liquidity snapshot...",
      },
      {
        agent: "Analyst agent",
        text: "Simulating swap impact across the current liquidity curve with pandas...",
      },
    ],
    answer:
      "Yes, with room to spare. The USDC/ETH 0.05% pool has **$41.2M** in active liquidity within ±2% of the current price. A $250k swap would move the price by roughly **0.18%** — well inside normal slippage tolerance. The tighter 0.01% pool is thinner and would move price ~0.6%, so route through the 0.05% pool.",
    sources: [
      { label: "Uniswap v3 Ethereum — USDC/ETH pool ticks", id: "uniswap/uniswap-v3-ethereum" },
    ],
    bar: {
      title: "Active liquidity by pool fee tier (USD, ±2% of price)",
      unit: "$",
      data: [
        { label: "0.01%", value: 6_400_000, color: "#5c6862" },
        { label: "0.05%", value: 41_200_000, color: "#ffb454" },
        { label: "0.30%", value: 18_900_000, color: "#e8935c" },
        { label: "1.00%", value: 2_100_000, color: "#6fe3a1" },
      ],
    },
  },
];

const HISTORY_AGO = ["2h ago", "yesterday", "2d ago", "4d ago", "6d ago"];

export const HISTORY = SCENARIOS.map((s, i) => ({
  scenario: s,
  agoLabel: HISTORY_AGO[i] ?? `${i + 1}d ago`,
}));

export const FALLBACK_ANSWER =
  "This is a hardcoded paper prototype — only the suggested questions above have scripted answers. Ask one of those to see the full simulated agent flow.";
