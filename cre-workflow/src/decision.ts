/**
 * Pure, framework-free decision logic for Lamplighter's liquidation
 * defense policy.
 *
 * Deliberately zero imports from `@chainlink/cre-sdk` (or anything else): this
 * module is the part of the system whose correctness must be provable with a
 * plain test runner (vitest), independent of whether the CRE workflow that
 * wraps it has ever been registered, simulated, or deployed against a live
 * CRE account. `workflow.ts` in this package imports these two functions and
 * calls them from inside a confidential TEE handler — but the functions
 * themselves know nothing about CRE, enclaves, or triggers.
 *
 * Threshold semantics
 * --------------------
 * - `riskRatio` is the PUBLIC health signal computed upstream by the Graph
 *   module (see `agent/src/graph/`), the same formula for every protocol:
 *
 *       riskRatio = debtUSD / (collateralUSD * liquidationThresholdBps / 10000)
 *
 *   `riskRatio >= 1` means the position is objectively liquidatable right
 *   now, independent of any policy choice — that fixed knee is what
 *   `sizeDefense` scales severity against.
 *
 * - `minHealthFactorBps` is the PRIVATE, policy-owner-chosen early-warning
 *   threshold, expressed in basis points of "health factor" (10000 bps ==
 *   a health factor of 1.0, the same knee `riskRatio = 1` sits at). A
 *   conservative policy sets this above 10000 (e.g. 12000 == HF 1.20) to
 *   defend well before the position is actually liquidatable.
 *
 *   This is exactly the number a mempool-watching attacker would want:
 *   knowing it lets them nudge price just short of the trigger, or race the
 *   defense transaction once they see it coming. That's the whole reason
 *   this value is read only inside the CRE Confidential Workflow's TEE
 *   handler (see `workflow.ts`) and never appears in a public workflow
 *   config, a log line, or an on-chain call.
 *
 * - `maxDefenseUsdc` is the PRIVATE emergency-capital spending cap. It bounds
 *   how much USDC any single defense may deploy, regardless of how large the
 *   computed need is.
 */

/**
 * Decide whether a defense should be authorized at all.
 *
 * Health factor implied by `riskRatio` is `1 / riskRatio`. We defend once
 * that implied health factor falls to (or below) the private policy floor
 * `minHealthFactorBps / 10000`. Comparing in riskRatio-space instead
 * (`riskRatio >= 10000 / minHealthFactorBps`) is numerically identical and
 * avoids a division by a possibly-zero riskRatio.
 *
 * The comparison is inclusive: a position sitting exactly on the threshold
 * is treated as already needing defense, not one tick away from it.
 */
export function shouldDefend(riskRatio: number, minHealthFactorBps: number): boolean {
  if (!Number.isFinite(minHealthFactorBps) || minHealthFactorBps <= 0) {
    throw new Error("minHealthFactorBps must be a positive number of basis points");
  }
  if (!Number.isFinite(riskRatio) || riskRatio <= 0) {
    return false;
  }

  const triggerRiskRatio = 10_000 / minHealthFactorBps;
  return riskRatio >= triggerRiskRatio;
}

/**
 * Size the defense in USDC.
 *
 * Note this takes `riskRatio` directly (not the policy threshold): sizing is
 * driven by objective severity relative to the hard liquidation line
 * (`riskRatio = 1`), not by how conservative the policy's early-warning
 * threshold happens to be. A policy that triggers early (high
 * `minHealthFactorBps`) still only deploys capital proportional to how close
 * the position actually is to liquidation.
 *
 * The fraction of the debt considered "at risk" scales linearly with
 * severity: `riskRatio = 0` needs no defense, `riskRatio >= 1` (at or past
 * the liquidation line) may need up to the full outstanding debt covered.
 * The result is then capped by both the private spending cap and the debt
 * itself — never spend more emergency capital than the policy allows, and
 * never "repay" more than is actually owed.
 */
export function sizeDefense(riskRatio: number, debtUSD: number, maxDefenseUsdc: number): number {
  if (!Number.isFinite(riskRatio) || riskRatio <= 0) return 0;
  if (!Number.isFinite(debtUSD) || debtUSD <= 0) return 0;
  if (!Number.isFinite(maxDefenseUsdc) || maxDefenseUsdc <= 0) return 0;

  const severity = Math.min(Math.max(riskRatio, 0), 1);
  const rawAmount = severity * debtUSD;

  return Math.min(rawAmount, maxDefenseUsdc, debtUSD);
}
