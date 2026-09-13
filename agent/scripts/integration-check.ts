import "dotenv/config";
import { getDemoVaultState } from "../src/chain/vault.js";
import { pollOnce } from "../src/index.js";
import { getDemoUser } from "../src/config.js";
import { getRecentActivity } from "../src/api/activity.js";

/**
 * One-shot local integration check: run against an already-deployed +
 * seeded local anvil stack (see contracts/README.md / docs/architecture-notes.md section 7
 * for the deploy+seed steps) and prove the full decision loop actually
 * fires an on-chain defense when the demo position is underwater.
 *
 * Does NOT start the API server or the poll interval (see the
 * `isMainModule` guard in src/index.ts) — just calls `pollOnce()` directly,
 * once, so this can run to completion and exit with a clear pass/fail.
 */
async function main(): Promise<void> {
  const user = getDemoUser();

  const before = await getDemoVaultState(user);
  console.log("BEFORE:", JSON.stringify(before, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

  await pollOnce();

  const after = await getDemoVaultState(user);
  console.log("AFTER:", JSON.stringify(after, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

  const activity = getRecentActivity();
  console.log(`\nActivity log (${activity.length} events):`);
  for (const e of activity) console.log(`  [${e.type}] ${e.message}${e.txHash ? ` (tx: ${e.txHash})` : ""}`);

  const defended = activity.some((e) => e.type === "defense_executed");
  if (before.healthFactor < 1.1 && !defended) {
    console.error("\nFAIL: position was underwater but no defense_executed event was logged.");
    process.exitCode = 1;
    return;
  }
  if (defended && after.healthFactor <= before.healthFactor) {
    console.error("\nFAIL: defense_executed logged but health factor did not improve.");
    process.exitCode = 1;
    return;
  }
  console.log(
    defended
      ? "\nPASS: defense fired and health factor improved."
      : "\nPASS: position was healthy, correctly took no action.",
  );
}

main().catch((err: unknown) => {
  console.error("integration-check fatal error:", err);
  process.exitCode = 1;
});
