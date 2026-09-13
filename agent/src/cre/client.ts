import { shouldDefend, sizeDefense } from "./decision.js";

/** The user-owned, private policy — in production these two fields are read only
 *  inside the Chainlink CRE Confidential Workflow's TEE handler (`cre-workflow/workflow.ts`),
 *  never in a public log or on-chain call. Locally, they come straight from
 *  `WatchmanVault.policies(user)` (see `chain/vault.ts`) since there's no meaningful
 *  "private" boundary on your own machine during development. */
export interface DefensePolicy {
  minHealthFactorBps: number;
  maxDefenseUsdc: number;
}

/** Mirrors the exact output shape the deployed CRE workflow returns (docs/architecture-notes.md 5.3). */
export interface DefenseAuthorization {
  shouldDefend: boolean;
  defenseAmountUsdc: number;
}

/**
 * The local-dev equivalent of calling the deployed CRE Confidential Workflow.
 * Swap the body of this function for an HTTP/gRPC call to the deployed
 * workflow's trigger endpoint once `CRE_API_KEY` + `cre login` are set up
 * (see `cre-workflow/README.md` for the exact manual command) — the call
 * site in `agent/src/index.ts` does not need to change, since the input/
 * output shape is identical either way.
 */
export function evaluateDefense(
  riskRatio: number,
  debtUSD: number,
  policy: DefensePolicy,
): DefenseAuthorization {
  const authorized = shouldDefend(riskRatio, policy.minHealthFactorBps);
  const defenseAmountUsdc = authorized ? sizeDefense(riskRatio, debtUSD, policy.maxDefenseUsdc) : 0;
  return { shouldDefend: authorized, defenseAmountUsdc };
}
