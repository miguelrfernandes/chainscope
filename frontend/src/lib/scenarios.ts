export type AgentStep = {
  agent: string;
  text: string;
};

export type Source = { label: string; id: string; query: string };
export type BarDatum = { label: string; value: number; color: string };
export type LineDatum = { label: string; value: number };
export type TableRow = Record<string, string>;

export type ScenarioAction = {
  id: string;
  label: string;
  description: string;
  protocol: string;
  value?: string;
  cta: string;
};

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
  actions?: ScenarioAction[];
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
        text: "Querying wallet balances subgraph on Ethereum via The Graph Subgraph MCP...",
      },
      {
        agent: "Portfolio agent",
        text: "Querying wallet balances subgraph on Arbitrum via The Graph Subgraph MCP...",
      },
      {
        agent: "Analyst agent",
        text: "Aggregating balances with pandas, computing USD values...",
      },
    ],
    answer:
      "Your wallet (0x8f2a...c91b) currently holds **$48,320** across 2 chains. Ethereum mainnet accounts for 71% of holdings, mostly ETH and staked ETH, while Arbitrum holds the rest, largely in USDC and ARB. Your largest single position is 6.2 ETH ($21,750).",
    sources: [
      {
        label: "Wallet balances — Ethereum",
        id: "messari/erc20-balances-ethereum",
        query:
          "GET /balances/evm/0x8f2a19b4d3f0c9a17e6b2d4c8a5f31e0b6c7c91b?chain=ethereum (Token API)",
      },
      {
        label: "Wallet balances — Arbitrum",
        id: "messari/erc20-balances-arbitrum",
        query:
          "GET /balances/evm/0x8f2a19b4d3f0c9a17e6b2d4c8a5f31e0b6c7c91b?chain=arbitrum (Token API)",
      },
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
    id: "risk-monitor",
    question: "Am I close to liquidation on my Aave position?",
    agent: "Risk monitor agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Risk monitor agent..." },
      {
        agent: "Risk monitor agent",
        text: "Querying your Aave v3 user position subgraph on The Graph via Subgraph MCP...",
      },
      {
        agent: "Risk monitor agent",
        text: "Computing health factor from collateral and debt...",
      },
    ],
    answer:
      "Your Aave v3 position has a **health factor of 1.34**. You've supplied $32,000 in stETH as collateral against a $19,200 USDC borrow. You're not in immediate danger, but a ~26% drop in stETH price would push your health factor below 1.0 and risk liquidation. Consider adding collateral or repaying part of the loan if you expect volatility.",
    sources: [
      {
        label: "Aave v3 Ethereum — user positions",
        id: "aave/protocol-v3-ethereum",
        query:
          "{ userReserve(id: \"0x8f2a19b4...-stETH\") { currentATokenBalance currentTotalDebt } }",
      },
    ],
    healthFactor: 1.34,
    actions: [
      {
        id: "add-collateral",
        label: "Add $5,000 stETH collateral",
        description:
          "Would raise your health factor from 1.34 to roughly 1.58, giving more buffer if stETH drops.",
        protocol: "Aave v3 · Ethereum",
        cta: "Add collateral",
      },
    ],
  },
  {
    id: "yield-advisor",
    question: "Do I have any idle assets that could be earning yield right now?",
    agent: "Yield advisor agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Yield advisor agent..." },
      {
        agent: "Yield advisor agent",
        text: "Checking wallet balances vs Aave aToken balances for USDC, DAI, LINK, WETH...",
      },
      {
        agent: "Yield advisor agent",
        text: "Querying Aave v3 Sepolia subgraph on The Graph via Subgraph MCP for current supply APY...",
      },
      {
        agent: "Yield advisor agent",
        text: "Ranking idle reserves by USD-equivalent balance...",
      },
    ],
    answer:
      "You've got **500 USDC** sitting in your wallet earning nothing — it's never been supplied to Aave. Aave v3's Sepolia market is currently paying **4.8% supply APY** on USDC, so that's roughly **$24/year** left on the table at current rates, with minimal added risk since you'd be supplying (not borrowing against) it. Your DAI, LINK, and WETH balances are either already supplied or below the dust threshold to bother with.",
    sources: [
      {
        label: "Aave v3 Sepolia — USDC reserve",
        id: "aave/protocol-v3-sepolia",
        query: "{ reserve(id: \"0x94a9...usdc\") { liquidityRate } } (converted from ray to APY)",
      },
    ],
    actions: [
      {
        id: "supply-usdc-aave",
        label: "Supply 500 USDC to Aave v3",
        description:
          "Currently idle in your wallet. Aave v3 Sepolia is paying 4.8% supply APY on USDC right now.",
        protocol: "Aave v3 · Sepolia",
        value: "500 USDC",
        cta: "Supply to Aave",
      },
    ],
  },
  {
    id: "sprawl",
    question: "Do I have any idle or forgotten positions across DeFi?",
    agent: "Discovery agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Discovery agent..." },
      {
        agent: "Discovery agent",
        text: "Scanning lending, LP, and staking subgraphs on The Graph across Ethereum and Arbitrum via Subgraph MCP...",
      },
      {
        agent: "Discovery agent",
        text: "Cross-referencing your full wallet history for every protocol you've ever interacted with...",
      },
      {
        agent: "Discovery agent",
        text: "Checking unclaimed rewards and unwithdrawn deposits across 14 protocols...",
      },
      {
        agent: "Analyst agent",
        text: "Ranking positions by USD value and days since last activity with pandas...",
      },
    ],
    answer:
      "DeFi sprawls — turns out you do. You have **4 positions worth $2,154** that you haven't touched in 90+ days, spread across protocols you likely forgot you'd used. The biggest is **0.8 ETH ($1,340) still supplied to Compound v2**, deposited back in March 2022 and never withdrawn — Compound v2 is effectively legacy now, so it's just sitting there earning a below-market rate. There's also **$284 in unclaimed Uniswap v3 LP fees** on Arbitrum accruing since December, plus small dust positions in Curve's 3pool and an old SushiSwap LP. I've pulled the two worth acting on below.",
    sources: [
      {
        label: "Compound v2 — account positions",
        id: "compound/compound-v2",
        query:
          "{ account(id: \"0x8f2a19b4...\") { tokens { symbol supplyBalanceUnderlying } } }",
      },
      {
        label: "Uniswap v3 Arbitrum — LP positions",
        id: "uniswap/uniswap-v3-arbitrum",
        query:
          "{ positions(where: { owner: \"0x8f2a19b4...\" }) { pool { token0 token1 } collectedFeesToken0 collectedFeesToken1 } }",
      },
      {
        label: "Curve — liquidity positions",
        id: "curve/curve-finance",
        query: "{ liquidityPositions(where: { user: \"0x8f2a19b4...\" }) { liquidityPool { name } balance } }",
      },
      {
        label: "SushiSwap — LP positions",
        id: "sushiswap/exchange",
        query: "{ liquidityPositions(where: { user: \"0x8f2a19b4...\" }) { pair { token0 token1 } } }",
      },
    ],
    table: {
      title: "Idle & forgotten positions (90+ days untouched)",
      columns: ["Protocol", "Chain", "Position", "Value", "Idle since"],
      rows: [
        { Protocol: "Compound v2", Chain: "Ethereum", Position: "0.8 ETH supplied (cETH)", Value: "$1,340", "Idle since": "Mar 2022" },
        { Protocol: "Curve", Chain: "Ethereum", Position: "3pool LP (dust)", Value: "$320", "Idle since": "Nov 2021" },
        { Protocol: "Uniswap v3", Chain: "Arbitrum", Position: "USDC/ARB LP, unclaimed fees", Value: "$284", "Idle since": "Dec 2024" },
        { Protocol: "SushiSwap", Chain: "Ethereum", Position: "ETH/USDC LP (dust)", Value: "$210", "Idle since": "Jun 2022" },
      ],
    },
    actions: [
      {
        id: "claim-uniswap-fees",
        label: "Claim Uniswap v3 LP fees",
        description: "$284 in accrued USDC/ARB fees on Arbitrum, unclaimed since December.",
        protocol: "Uniswap v3 · Arbitrum",
        value: "$284",
        cta: "Claim fees",
      },
      {
        id: "withdraw-compound",
        label: "Withdraw idle Compound v2 ETH",
        description:
          "0.8 ETH supplied in 2022, still earning cETH. Compound v3 offers a better rate for the same risk.",
        protocol: "Compound v2 · Ethereum",
        value: "$1,340",
        cta: "Withdraw",
      },
    ],
  },
  {
    id: "trading",
    question: "Is there enough USDC/ETH liquidity on Uniswap to swap $250k without much slippage?",
    agent: "Trading agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Trading agent..." },
      {
        agent: "Trading agent",
        text: "Querying Uniswap v3 Ethereum subgraph on The Graph via Subgraph MCP (pool: USDC/ETH 0.05%)...",
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
      {
        label: "Uniswap v3 Ethereum — USDC/ETH pool ticks",
        id: "uniswap/uniswap-v3-ethereum",
        query:
          "{ pool(id: \"0x88e6...0640\") { ticks(first: 1000, orderBy: tickIdx) { tickIdx liquidityNet } } } (paid via x402)",
      },
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
  {
    id: "hedera-transfer",
    question: "Transfer 1 HBAR on Hedera testnet to account 0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB",
    agent: "Hedera agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Hedera agent..." },
      {
        agent: "Hedera agent",
        text: "Checking sender account balance via Hedera Mirror Node...",
      },
      {
        agent: "Hedera agent",
        text: "Constructing HBAR transfer transaction for account 0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB...",
      },
      {
        agent: "Hedera agent",
        text: "Executing transfer via Hedera SDK / Agent Kit...",
      },
    ],
    answer:
      "Successfully transferred **1 HBAR** to account `0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB` on Hedera testnet. Transaction fee: **0.001 HBAR**. Remaining account balance: **499 HBAR**.",
    sources: [
      {
        label: "Hedera Mirror Node — Account 0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB",
        id: "hedera/testnet-mirror-node",
        query: "GET /api/v1/accounts/0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB",
      },
    ],
    actions: [
      {
        id: "transfer-hbar",
        label: "Transfer 1 HBAR",
        description: "Send 1 HBAR to recipient account 0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB on Hedera testnet.",
        protocol: "Hedera Testnet",
        value: "1 HBAR",
        cta: "Confirm Transfer",
      },
    ],
  },
  {
    id: "hedera-create-agent",
    question: "Create a Hedera agent named YieldSentinel tied to my wallet and seed it with 1 HBAR",
    agent: "Hedera agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Hedera agent..." },
      {
        agent: "Hedera agent",
        text: "Generating ED25519 keypair and provisioning account on Hedera testnet...",
      },
      {
        agent: "Hedera agent",
        text: "Encrypting private key with AES-256-GCM and registering agent 'YieldSentinel' to Vault...",
      },
      {
        agent: "Hedera agent",
        text: "Building seed transfer transaction for 1 HBAR...",
      },
    ],
    answer:
      "Successfully created new Hedera sub-agent **YieldSentinel** (`0.0.78492`, EVM Alias: `0x78492...b4a1`) tied to your wallet. Private key has been encrypted and stored in the backend vault. To activate autonomous execution, confirm the 1 HBAR initial seed funding below.",
    sources: [
      {
        label: "Hedera Testnet Account Provisioner",
        id: "hedera/account-create",
        query: "AccountCreateTransaction(name=\"YieldSentinel\", initialBalance=0, key=ED25519)",
      },
    ],
    actions: [
      {
        id: "seed-agent-hbar",
        label: "Seed YieldSentinel (0.0.78492) with 1 HBAR",
        description: "Fund your newly created agent account YieldSentinel (0.0.78492) with 1 HBAR from your connected wallet.",
        protocol: "Hedera Testnet",
        value: "1 HBAR",
        cta: "Seed 1 HBAR",
      },
    ],
  },
  {
    id: "hedera-list-agents",
    question: "Which Hedera sub-agents do I have registered in my vault?",
    agent: "Hedera agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Hedera agent..." },
      {
        agent: "Hedera agent",
        text: "Querying Agent Vault database for sub-agents registered to wallet 0x8f2a...c91b...",
      },
      {
        agent: "Hedera agent",
        text: "Fetching active balances and status for sub-agent accounts on Hedera testnet Mirror Node...",
      },
    ],
    answer:
      "You currently have **1 managed Hedera sub-agent** registered to your wallet:\n\n- **YieldSentinel** (`0.0.78492`, EVM Alias: `0x78492...b4a1`)\n  - **Status**: Active (AES-256-GCM encrypted in Vault)\n  - **Balance**: 1 HBAR\n  - **Active Schedules**: Daily portfolio drift scan & hourly HSS transfer loop",
    sources: [
      {
        label: "ChainScope Agent Vault",
        id: "chainscope/agent-vault",
        query: "SELECT owner_address, agent_name, account_id, status FROM managed_agents WHERE owner_address = '0x8f2a...c91b'",
      },
      {
        label: "Hedera Mirror Node — Account Balances",
        id: "hedera/account-balances-0.0.78492",
        query: "GET /api/v1/accounts/0.0.78492",
      },
    ],
    table: {
      title: "Registered Managed Agents",
      columns: ["Agent Name", "Account ID", "EVM Alias", "Status", "Balance"],
      rows: [
        {
          "Agent Name": "YieldSentinel",
          "Account ID": "0.0.78492",
          "EVM Alias": "0x78492...b4a1",
          Status: "ACTIVE",
          Balance: "1 HBAR",
        },
      ],
    },
  },
  {
    id: "hedera-schedule-loop",
    question: "Schedule an autonomous loop for YieldSentinel to scan its token holdings daily and rebalance allocations if drift exceeds 5%",
    agent: "Hedera agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Hedera agent..." },
      {
        agent: "Hedera agent",
        text: "Resolving agent 'YieldSentinel' (0.0.78492) from Vault...",
      },
      {
        agent: "Hedera agent",
        text: "Parsing allocation review condition (Frequency: Daily, Drift Threshold: > 5%)...",
      },
      {
        agent: "Hedera agent",
        text: "Registering in-process APScheduler job in Embedded Task Vault...",
      },
      {
        agent: "Hedera agent",
        text: "Configuring Hedera Mirror Node token scanner for YieldSentinel...",
      },
    ],
    answer:
      "Recurring portfolio review loop registered successfully for **YieldSentinel** (`0.0.78492`)! **Schedule**: `0 0 * * *` (Daily at midnight). **Action**: Scans agent account `0.0.78492` HTS token holdings via Mirror Node API; computes target asset allocation and executes rebalancing swaps if drift exceeds `5%`. Runs securely in-process.",
    sources: [
      {
        label: "Embedded ACP Task Scheduler",
        id: "chainscope/embedded-apscheduler",
        query: "APScheduler.add_job(id=\"cron-YieldSentinel-0.0.78492-rebalance\", trigger=\"cron\", hour=0)",
      },
    ],
  },
  {
    id: "hedera-scheduled-transfer",
    question: "Schedule a recurring transfer of 1 HBAR every 1 hour to YieldSentinel agent using Hedera Schedule Service",
    agent: "Hedera agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to Hedera wallet action agent..." },
      {
        agent: "Hedera wallet action agent",
        text: "Resolving YieldSentinel agent account 0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB and checking connected EVM wallet on Hedera testnet...",
      },
      {
        agent: "Hedera wallet action agent",
        text: "Checking ScheduledVaultFactory contract deployment on Hedera testnet...",
      },
      {
        agent: "Hedera wallet action agent",
        text: "Constructing multi-step HSS precompile transaction sequence (createVault, configure, deposit, scheduleNextRun)...",
      },
    ],
    answer:
      "Successfully prepared a recurring transfer sequence of **1 HBAR every 3600 seconds** (1 hour) to YieldSentinel agent (`0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB`) using Hedera's Schedule Service (HSS) precompile (`0x16b`). The 4-step execution plan (create ScheduledVault, configure interval, deposit initial 1 HBAR, and call `scheduleNextRun`) is ready for your connected EVM wallet to sign.",
    sources: [
      {
        label: "Hedera Schedule Service (HSS) Precompile",
        id: "hedera/schedule-service-0x16b",
        query: "IHederaScheduleService.scheduleCall(address target, bytes calldata, uint64 expirySec)",
      },
      {
        label: "ScheduledVaultFactory Contract",
        id: "hedera/scheduled-vault-factory",
        query: "createVault(address strategy), configure(bytes config, uint256 interval), deposit(), scheduleNextRun()",
      },
    ],
    actions: [
      {
        id: "schedule-recurring-hbar",
        label: "Schedule 1 HBAR transfer every hour to YieldSentinel (HSS)",
        description: "Set up a recurring 1 HBAR transfer to YieldSentinel agent using Hedera Schedule Service precompiles for your EVM wallet.",
        protocol: "Hedera Schedule Service · Testnet",
        value: "1 HBAR / 1h",
        cta: "Sign Scheduled Sequence",
      },
    ],
  },
  {
    id: "saucerswap-apr",
    question: "What's the best APR I can get farming on SaucerSwap right now?",
    agent: "SaucerSwap agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to SaucerSwap agent..." },
      {
        agent: "SaucerSwap agent",
        text: "Fetching SaucerSwap farms/pools/token prices to compute pool APRs...",
      },
    ],
    answer:
      "The top farm on SaucerSwap right now is the **SAUCE/XSAUCE pool at ~18.4% APR** (~$1.1M TVL staked), followed by **HBAR/SAUCE at ~12.7% APR**. APRs are computed live from current SAUCE + HBAR emission rates against USD-priced TVL, so they move with token prices and staked amounts — worth rechecking before committing size.",
    sources: [
      {
        label: "SaucerSwap REST API — farms/pools/tokens",
        id: "saucerswap/rest-api/farms-pools-tokens",
        query: "GET /farms, GET /pools, GET /tokens (api.saucerswap.finance)",
      },
    ],
    table: {
      title: "Top SaucerSwap farms by APR",
      columns: ["Pair", "APR", "TVL Staked"],
      rows: [
        { Pair: "SAUCE/XSAUCE", APR: "18.4%", "TVL Staked": "$1.1M" },
        { Pair: "HBAR/SAUCE", APR: "12.7%", "TVL Staked": "$2.4M" },
        { Pair: "USDC/HBAR", APR: "9.1%", "TVL Staked": "$3.8M" },
      ],
    },
  },
  {
    id: "saucerswap-swap",
    question: "Connected wallet: 0x8f2a19b4d3f0c9a17e6b2d4c8a5f31e0b6c7c91b — Swap 10 SAUCE for WHBAR on SaucerSwap",
    agent: "SaucerSwap agent",
    steps: [
      { agent: "Orchestrator", text: "Routing to SaucerSwap agent..." },
      {
        agent: "SaucerSwap agent",
        text: "Building SaucerSwap V2 swap: 10 SAUCE -> WHBAR...",
      },
    ],
    answer:
      "Built a SaucerSwap V2 swap: **10 SAUCE → WHBAR** via SwapRouter's `exactInput` (0.30% fee tier). It's a two-step transaction — an ERC20 approve followed by the swap itself — ready for your connected wallet to sign below. Nothing has executed yet.",
    sources: [
      {
        label: "SaucerSwap V2 SwapRouter — Hedera Testnet",
        id: "saucerswap/swaprouter-v2-testnet",
        query: "exactInput((bytes,address,uint256,uint256,uint256)) on 0.0.1414040",
      },
    ],
    actions: [
      {
        id: "saucerswap-swap-tx",
        label: "Swap 10 SAUCE for WHBAR",
        description: "Approve + swap 10 SAUCE for WHBAR on SaucerSwap V2 (Hedera testnet).",
        protocol: "SaucerSwap V2 · Hedera Testnet",
        value: "10 SAUCE",
        cta: "Execute Swap",
      },
    ],
  },
];

const HISTORY_AGO = ["2h ago", "yesterday", "2d ago", "3d ago", "4d ago", "6d ago"];

export const HISTORY = SCENARIOS.map((s, i) => ({
  scenario: s,
  agoLabel: HISTORY_AGO[i] ?? `${i + 1}d ago`,
}));

export const FALLBACK_ANSWER =
  "This is a hardcoded paper prototype — only the suggested questions above have scripted answers. Ask one of those to see the full simulated agent flow.";
