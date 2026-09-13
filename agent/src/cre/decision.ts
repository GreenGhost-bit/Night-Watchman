/**
 * VENDORED COPY of `cre-workflow/src/decision.ts`'s pure decision logic.
 *
 * `agent/` and `cre-workflow/` are independent npm packages (separate
 * `package.json`/`tsconfig.json`, no shared workspace or build step), so
 * importing across them directly would break `tsc`'s `rootDir` boundary.
 * Rather than introduce monorepo tooling under hackathon time pressure, this
 * ~50-line, fully unit-tested, dependency-free pair of functions is
 * duplicated here verbatim. If you change the policy math, change it in
 * BOTH places (`cre-workflow/src/decision.ts` is the source of truth) —
 * `agent/test/cre.test.ts` asserts both copies agree on the same fixtures.
 *
 * See `cre-workflow/src/decision.ts` for the full rationale of why
 * `minHealthFactorBps` and `maxDefenseUsdc` must stay private (read only
 * inside a Chainlink CRE Confidential Workflow's TEE handler in production)
 * even though this local copy, used for anvil-local development and testing,
 * necessarily runs in plaintext.
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

export function sizeDefense(riskRatio: number, debtUSD: number, maxDefenseUsdc: number): number {
  if (!Number.isFinite(riskRatio) || riskRatio <= 0) return 0;
  if (!Number.isFinite(debtUSD) || debtUSD <= 0) return 0;
  if (!Number.isFinite(maxDefenseUsdc) || maxDefenseUsdc <= 0) return 0;

  const severity = Math.min(Math.max(riskRatio, 0), 1);
  const rawAmount = severity * debtUSD;

  return Math.min(rawAmount, maxDefenseUsdc, debtUSD);
}
