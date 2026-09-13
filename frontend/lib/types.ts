// Shared types mirroring agent/src/graph + agent/src/api response shapes (PROJECT.md 5.2, 5.4).

export type Protocol = "aave-v3" | "compound-v3" | "morpho-blue" | "spark";

export interface PositionRisk {
  protocol: Protocol;
  account: string;
  collateralUSD: number;
  debtUSD: number;
  liquidationThresholdBps: number;
  /** debtUSD / (collateralUSD * liquidationThresholdBps / 10000). >= 1 means liquidatable. */
  riskRatio: number;
}

export type RiskStatus = "healthy" | "warning" | "critical";

export function riskStatus(riskRatio: number): RiskStatus {
  if (riskRatio >= 0.9) return "critical";
  if (riskRatio >= 0.7) return "warning";
  return "healthy";
}

export interface VaultPolicy {
  maxSpendPerTx: number;
  maxSpendPerDay: number;
  minHealthFactorBps: number;
}

export interface VaultState {
  user: string;
  vaultAddress: string | null;
  balanceUSDC: number;
  collateralWeth: number;
  debtUSDC: number;
  healthFactor: number;
  policy: VaultPolicy;
  agentAuthorized: boolean;
  priceFeedUsd: number;
}

export type ActivityEventType =
  | "no_action"
  | "defense_executed"
  | "policy_updated"
  | "price_crash"
  | "warning"
  | "info";

export interface ActivityEvent {
  id: string;
  timestamp: number; // epoch ms
  type: ActivityEventType;
  message: string;
  protocol?: Protocol | "arc-demo-vault";
  account?: string;
  txHash?: string;
  riskRatio?: number;
}
