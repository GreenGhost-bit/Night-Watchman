/**
 * The single, shared risk-normalization formula.
 *
 * This is the entire point of the Graph submission: the SAME function, with
 * the SAME formula, is called for every protocol (Aave v3, Compound v3,
 * Spark, Seamless, ...). Nothing here is protocol-specific. Protocol
 * differences are absorbed upstream, in graph/client.ts + graph/schema.ts,
 * by the fact that every Messari-standardized lending subgraph answers the
 * exact same GraphQL query shape with the exact same field names.
 */

/** One position-side entry as returned by the shared Messari lending query. */
export interface RawPositionEntry {
  /** PositionSide: "COLLATERAL" | "BORROWER" */
  side: "COLLATERAL" | "BORROWER";
  /** USD value of this position (from the position's latest snapshot). */
  balanceUSD: number;
  /** Market-level liquidation threshold, as a percentage value (e.g. 80 == 80%). */
  liquidationThreshold: number;
  /** Market name, for debugging/display only - not used in the formula. */
  marketName: string;
}

/** Raw, per-account data for a single protocol, already flattened from the GraphQL response. */
export interface RawAccountPositions {
  account: string;
  positions: RawPositionEntry[];
}

export interface PositionRisk {
  protocol: string;
  account: string;
  collateralUSD: number;
  debtUSD: number;
  /** Collateral-weighted average liquidation threshold, in basis points (10000 == 100%). */
  liquidationThresholdBps: number;
  /** debtUSD / (collateralUSD * liquidationThresholdBps / 10000). >= 1 means liquidatable. */
  riskRatio: number;
}

/**
 * Normalize one account's raw positions (from any Messari-standardized lending
 * subgraph) into a single PositionRisk. This exact function, unmodified, is
 * used for every protocol - that sameness is the composability argument.
 *
 * riskRatio formula, matching real health-factor math for multi-asset
 * collateral: the liquidation threshold used is the collateral-USD-weighted
 * average across all of the account's collateral positions in this
 * protocol (equivalent to summing collateral_i * liqThreshold_i and
 * dividing by total debt).
 */
export function normalizePosition(raw: RawAccountPositions, protocol: string): PositionRisk {
  let collateralUSD = 0;
  let debtUSD = 0;
  let weightedThresholdSum = 0; // sum(collateralUSD_i * liquidationThreshold_i), threshold as fraction (0-1)

  for (const position of raw.positions) {
    if (position.side === "COLLATERAL") {
      collateralUSD += position.balanceUSD;
      weightedThresholdSum += position.balanceUSD * (position.liquidationThreshold / 100);
    } else if (position.side === "BORROWER") {
      debtUSD += position.balanceUSD;
    }
  }

  // Collateral-weighted average liquidation threshold, in basis points.
  const liquidationThresholdBps =
    collateralUSD > 0 ? Math.round((weightedThresholdSum / collateralUSD) * 10000) : 0;

  const riskRatio = computeRiskRatio(debtUSD, collateralUSD, liquidationThresholdBps);

  return {
    protocol,
    account: raw.account,
    collateralUSD,
    debtUSD,
    liquidationThresholdBps,
    riskRatio,
  };
}

/**
 * riskRatio = debtUSD / (collateralUSD * liquidationThresholdBps / 10000)
 *
 * Edge cases:
 *  - No debt at all -> riskRatio is 0 (perfectly safe), regardless of collateral.
 *  - Debt exists but no (usable) collateral -> riskRatio is Infinity (already
 *    maximally liquidatable / undercollateralized).
 */
export function computeRiskRatio(
  debtUSD: number,
  collateralUSD: number,
  liquidationThresholdBps: number,
): number {
  if (debtUSD === 0) return 0;
  const adjustedCollateral = (collateralUSD * liquidationThresholdBps) / 10000;
  if (adjustedCollateral === 0) return Infinity;
  return debtUSD / adjustedCollateral;
}
