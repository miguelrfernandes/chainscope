export type AgentStep = {
  agent: string;
  text: string;
};

export type BarDatum = { label: string; value: number; color: string };
export type LineDatum = { label: string; value: number };
export type TableRow = Record<string, string>;

export type Scenario = {
  id: string;
  question: string;
  steps: AgentStep[];
  answer: string;
  bar?: { title: string; unit: string; data: BarDatum[] };
  line?: { title: string; unit: string; data: LineDatum[] };
  table?: { title: string; columns: string[]; rows: TableRow[] };
  healthFactor?: number;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "portfolio",
    question: "What's my portfolio breakdown across chains right now?",
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
    bar: {
      title: "Holdings by asset (USD)",
      unit: "$",
      data: [
        { label: "ETH", value: 21750, color: "#8b7cf6" },
        { label: "stETH", value: 6800, color: "#6ea8fe" },
        { label: "USDC", value: 12100, color: "#4dd4ac" },
        { label: "ARB", value: 4200, color: "#f5a35c" },
        { label: "Other", value: 3470, color: "#8892a6" },
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
    healthFactor: 1.34,
  },
];

export const FALLBACK_ANSWER =
  "This is a hardcoded paper prototype — only the 3 suggested questions above have scripted answers. Ask one of those to see the full simulated agent flow.";
