import "dotenv/config";
import { pathToFileURL } from "node:url";
import { getWatchtower } from "./graph/watchtower.js";
import { getDemoVaultState, submitDefense } from "./chain/vault.js";
import { evaluateDefense } from "./cre/client.js";
import { startApiServer } from "./api/server.js";
import { logActivity } from "./api/activity.js";
import { getDemoUser, getPollIntervalMs, getWatchlist } from "./config.js";

/**
 * Lamplighter's main poll loop (docs/architecture-notes.md section 5.4):
 *
 *   Graph watchtower (read-only, real market data)  ─┐
 *                                                      ├─> logged to the activity feed
 *   Demo vault health factor (real Arc/anvil tx)     ─┘        (served over REST + WS)
 *                        │
 *                        ▼
 *      cre/client.ts (local stand-in for the deployed
 *      Chainlink CRE Confidential Workflow — same
 *      shouldDefend/sizeDefense math, same input/output
 *      shape; see that file's docstring for the swap-in
 *      point once a real CRE account exists)
 *                        │
 *                        ▼ (only if shouldDefend)
 *      chain/vault.ts -> WatchmanVault.executeDefense
 *      (real on-chain transaction, policy-capped)
 */
export async function pollOnce(): Promise<void> {
  const user = getDemoUser();

  // 1. Watchtower — real, live, read-only cross-protocol data. This alone is
  //    the Graph composability submission; nothing below depends on it.
  try {
    const risks = await getWatchtower(getWatchlist());
    const critical = risks.filter((r) => r.riskRatio >= 0.9);
    if (critical.length > 0) {
      logActivity({
        type: "warning",
        message: `Watchtower: ${critical.length} position(s) at or above 0.90 risk ratio across ${new Set(critical.map((r) => r.protocol)).size} protocol(s).`,
      });
    }
  } catch (err) {
    console.error("[watchman-agent] watchtower poll failed:", err);
  }

  // 2. Demo vault — the self-controlled Arc/anvil fixture the agent can
  //    actually defend live (docs/architecture-notes.md section 2).
  let vaultState;
  try {
    vaultState = await getDemoVaultState(user);
  } catch (err) {
    console.error("[watchman-agent] demo vault read failed:", err);
    return;
  }

  if (!vaultState.vaultAddress) {
    // Nothing deployed yet — stay quiet rather than spamming "not deployed" every tick.
    return;
  }

  if (vaultState.debtUSDC === 0) {
    return; // no open position to defend
  }

  const riskRatio = vaultState.healthFactor > 0 ? 1 / vaultState.healthFactor : Infinity;

  const authorization = evaluateDefense(riskRatio, vaultState.debtUSDC, {
    minHealthFactorBps: vaultState.policy.minHealthFactorBps,
    maxDefenseUsdc: vaultState.policy.maxSpendPerTx,
  });

  if (!authorization.shouldDefend) {
    logActivity({
      type: "no_action",
      message: `Demo vault healthy (health factor ${vaultState.healthFactor.toFixed(3)}, risk ratio ${riskRatio.toFixed(3)}) — no defense needed.`,
      protocol: "arc-demo-vault",
      account: user,
      riskRatio,
    });
    return;
  }

  if (!vaultState.agentAuthorized) {
    logActivity({
      type: "warning",
      message: `Defense needed (risk ratio ${riskRatio.toFixed(3)}) but this agent is not authorized for ${user} — call authorizeAgent() first.`,
      protocol: "arc-demo-vault",
      account: user,
      riskRatio,
    });
    return;
  }

  if (vaultState.balanceUSDC < authorization.defenseAmountUsdc) {
    logActivity({
      type: "warning",
      message: `Defense needed ($${authorization.defenseAmountUsdc.toFixed(2)}) but vault balance ($${vaultState.balanceUSDC.toFixed(2)}) is insufficient.`,
      protocol: "arc-demo-vault",
      account: user,
      riskRatio,
    });
    return;
  }

  const reason = `Confidential-workflow-authorized defense: risk ratio ${riskRatio.toFixed(3)}, repaying $${authorization.defenseAmountUsdc.toFixed(2)} USDC.`;
  console.log(`[watchman-agent] DEFENDING: ${reason}`);

  try {
    const txHash = await submitDefense(user, authorization.defenseAmountUsdc, reason);
    logActivity({
      type: "defense_executed",
      message: reason,
      protocol: "arc-demo-vault",
      account: user,
      txHash,
      riskRatio,
    });
    console.log(`[watchman-agent] defense tx mined: ${txHash}`);
  } catch (err) {
    console.error("[watchman-agent] submitDefense failed:", err);
    logActivity({
      type: "warning",
      message: `Defense authorized but the on-chain transaction failed: ${(err as Error).message}`,
      protocol: "arc-demo-vault",
      account: user,
      riskRatio,
    });
  }
}

async function main(): Promise<void> {
  startApiServer();

  const intervalMs = getPollIntervalMs();
  console.log(`[watchman-agent] polling every ${intervalMs}ms (GRAPH_MODE=${process.env.GRAPH_MODE ?? "fixture"}, AGENT_NETWORK=${process.env.AGENT_NETWORK ?? "local"})`);

  logActivity({ type: "info", message: "Lamplighter is now on duty." });

  await pollOnce();
  setInterval(() => {
    pollOnce().catch((err: unknown) => console.error("[watchman-agent] poll loop error:", err));
  }, intervalMs);
}

// Only auto-start the server + poll loop when this file is run directly
// (`npm run dev`), not when imported (e.g. by an integration test script
// that wants to call `pollOnce()` a single time against a local anvil deploy
// without also binding the API port or starting an interval timer).
const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err: unknown) => {
    console.error("[watchman-agent] fatal error:", err);
    process.exitCode = 1;
  });
}
