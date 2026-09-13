/**
 * Workflow-wiring tests for the real @chainlink/cre-sdk integration.
 *
 * These run under `bun test` (see README.md), NOT `npm test` / vitest --
 * the published `@chainlink/cre-sdk` package resolves its internal modules
 * in a way plain Node/vitest's ESM resolver rejects ("Directory import ...
 * is not supported"). Bun's resolver accepts it; Chainlink's own official
 * templates all run their SDK-touching tests via `bun:test` for exactly
 * this reason. This is a real, confirmed toolchain constraint, not a
 * choice -- see README.md "Toolchain findings".
 *
 * `test/decision.test.ts` covers the actual decision logic and runs under
 * plain `npm test` / vitest with zero CRE dependency, by design (see that
 * file and src/decision.ts) -- that suite is what proves shouldDefend/
 * sizeDefense correctness without any CRE account or bun install.
 *
 * These tests exercise the real `handlerInTee` / trigger registration path
 * (not a mock) -- they prove the workflow wires up to the actual SDK
 * correctly, without needing a CRE account, a TEE, or the `cre` CLI. They
 * deliberately do NOT invoke `onDefenseTrigger` itself: that needs a real
 * (or CRE-CLI-simulated) TeeRuntime with getSecrets/usingTheDons, which is
 * exactly what `cre workflow simulate` exercises -- and that command's
 * account requirement is documented in README.md.
 */
import { describe, expect, test } from "bun:test";
import { initWorkflow, type Config } from "./workflow";

const validConfig: Config = {
  secretsIds: {
    minHealthFactorBps: "night_watchman_min_health_factor_bps",
    maxDefenseUsdc: "night_watchman_max_defense_usdc",
    executionKeyRef: "night_watchman_execution_key_ref",
  },
};

describe("initWorkflow", () => {
  test("registers exactly one TEE-constrained HTTP-triggered handler", () => {
    const handlers = initWorkflow(validConfig);
    expect(handlers).toHaveLength(1);
    // handlerInTee attaches TEE requirements; a plain `cre.handler` would not.
    expect(handlers[0].requirements).toBeDefined();
  });

  test("throws when minHealthFactorBps secret id is missing", () => {
    expect(() =>
      initWorkflow({
        secretsIds: { ...validConfig.secretsIds, minHealthFactorBps: "" },
      }),
    ).toThrow(/secretsIds/);
  });

  test("throws when maxDefenseUsdc secret id is missing", () => {
    expect(() =>
      initWorkflow({
        secretsIds: { ...validConfig.secretsIds, maxDefenseUsdc: "" },
      }),
    ).toThrow(/secretsIds/);
  });

  test("throws when executionKeyRef secret id is missing", () => {
    expect(() =>
      initWorkflow({
        secretsIds: { ...validConfig.secretsIds, executionKeyRef: "" },
      }),
    ).toThrow(/secretsIds/);
  });
});
