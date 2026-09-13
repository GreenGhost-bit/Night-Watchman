/**
 * CRE process entry point. `workflow.yaml`'s `workflow-path` points here.
 *
 * Kept to a few lines on purpose, matching Chainlink's own official
 * confidential-workflow templates (see README.md "Toolchain findings"):
 * `Runner.newRunner()` requires the real CRE WASM host runtime and throws
 * immediately outside of it, so nothing that imports `workflow.ts` for
 * testing (workflow.test.ts, and indirectly test/decision.test.ts) can be
 * allowed to import this file too.
 */
import { Runner } from "@chainlink/cre-sdk";
import { configSchema, initWorkflow } from "./workflow";

export async function main() {
  const runner = await Runner.newRunner({ configSchema });
  await runner.run(initWorkflow);
}

main();
