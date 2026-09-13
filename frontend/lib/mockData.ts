import type { ActivityEvent, PositionRisk, VaultState } from "./types";

// Realistic example data used only when the agent API (agent/src/api/) is
// unreachable — every view that uses this is clearly labeled "EXAMPLE DATA"
// in the UI, per the frontend spec's resilience requirement.

export const MOCK_WATCHTOWER: PositionRisk[] = [
  {
    protocol: "aave-v3",
    account: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    collateralUSD: 214_500,
    debtUSD: 201_030,
    liquidationThresholdBps: 8250,
    riskRatio: 201_030 / (214_500 * 0.825),
  },
  {
    protocol: "compound-v3",
    account: "0x1a2b3c4d5e6f7089aBcdEf0123456789aBCdEf01",
    collateralUSD: 58_200,
    debtUSD: 21_400,
    liquidationThresholdBps: 8000,
    riskRatio: 21_400 / (58_200 * 0.8),
  },
  {
    protocol: "morpho-blue",
    account: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
    collateralUSD: 96_800,
    debtUSD: 71_900,
    liquidationThresholdBps: 8600,
    riskRatio: 71_900 / (96_800 * 0.86),
  },
  {
    protocol: "spark",
    account: "0xdEaD00000000000000000000000000000BEeF01",
    collateralUSD: 12_050,
    debtUSD: 2_010,
    liquidationThresholdBps: 8000,
    riskRatio: 2_010 / (12_050 * 0.8),
  },
  {
    protocol: "aave-v3",
    account: "0x0f4A2c7D9e1B3a5C8d0E2f4A6B8C0d2E4f6A8B0C",
    collateralUSD: 340_000,
    debtUSD: 95_000,
    liquidationThresholdBps: 8250,
    riskRatio: 95_000 / (340_000 * 0.825),
  },
  {
    protocol: "compound-v3",
    account: "0x9988776655443322110099887766554433221100",
    collateralUSD: 4_400,
    debtUSD: 3_960,
    liquidationThresholdBps: 8000,
    riskRatio: 3_960 / (4_400 * 0.8),
  },
];

export const MOCK_VAULT_STATE: VaultState = {
  user: "0x0000000000000000000000000000000000BADA55",
  vaultAddress: null,
  balanceUSDC: 12_500,
  collateralWeth: 5.2,
  debtUSDC: 8_100,
  healthFactor: 1.42,
  policy: {
    maxSpendPerTx: 2_500,
    maxSpendPerDay: 10_000,
    minHealthFactorBps: 12_000,
  },
  agentAuthorized: true,
  priceFeedUsd: 2_450,
};

const now = Date.now();

export const MOCK_ACTIVITY: ActivityEvent[] = [
  {
    id: "evt-6",
    timestamp: now - 15_000,
    type: "no_action",
    message: "Poll cycle complete. All 6 watched positions within policy — riskRatio max 0.71 (compound-v3).",
    protocol: "compound-v3",
    riskRatio: 0.71,
  },
  {
    id: "evt-5",
    timestamp: now - 90_000,
    type: "defense_executed",
    message: "Demo vault riskRatio crossed 0.93. CRE workflow authorized defense — repaid 1,200 USDC to MockLendingPool.",
    protocol: "arc-demo-vault",
    account: "0x0000000000000000000000000000000000BADA55",
    txHash: "0x4a1f9c3e2b7d6a58f0c1e2d3b4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a21",
    riskRatio: 0.93,
  },
  {
    id: "evt-4",
    timestamp: now - 92_000,
    type: "price_crash",
    message: "MockPriceFeed.setPrice called from Demo Vault admin panel — ETH/USD moved 2,450 -> 1,380.",
    protocol: "arc-demo-vault",
  },
  {
    id: "evt-3",
    timestamp: now - 240_000,
    type: "warning",
    message: "Morpho Blue position 0x742d…0bEb7 riskRatio rose to 0.83 (warning band).",
    protocol: "morpho-blue",
    account: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
    riskRatio: 0.83,
  },
  {
    id: "evt-2",
    timestamp: now - 400_000,
    type: "policy_updated",
    message: "Owner updated demo vault policy: minHealthFactorBps 11,000 -> 12,000.",
    protocol: "arc-demo-vault",
  },
  {
    id: "evt-1",
    timestamp: now - 900_000,
    type: "info",
    message: "Agent orchestrator started. Watching 6 positions across 4 protocols + 1 Arc demo vault.",
  },
];
