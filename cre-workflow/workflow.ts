/**
 * The Night Watchman -- CRE Confidential Workflow entry point.
 *
 * Doubles as:
 *   1. The "Best Confidential Workflow" submission: a TEE handler holds the
 *      private liquidation-defense policy so nobody watching a public
 *      mempool or reading this workflow's registered config can learn the
 *      exact trigger threshold and front-run the defense (e.g. by
 *      triggering it themselves first, or nudging price just short of it).
 *   2. A fixture for Chainlink's Automated Liquidation Protection Challenge:
 *      protect a virtual ETH-collateral/USDC-debt position during simulated
 *      market movement, avoid liquidation, use emergency capital
 *      efficiently, and keep the protection rule and execution credential
 *      private. Same code, same trigger shape -- see README.md for how the
 *      two framings map onto this one workflow.
 *
 * SDK: @chainlink/cre-sdk (see package.json for the pinned version).
 *
 * The actual decision math (`shouldDefend`, `sizeDefense`) lives in
 * `src/decision.ts` as plain, framework-free TypeScript -- this file is only
 * the CRE runtime wrapper: trigger registration, the confidential handler,
 * pulling the private policy out of the Vault DON inside the enclave, and
 * crossing the resulting authorization back out to the Workflow DON for
 * consensus. Nothing in `src/decision.ts` needs a CRE account, a TEE, or the
 * `cre` CLI to be proven correct -- see test/decision.test.ts and README.md.
 *
 * This file exports `configSchema` and `initWorkflow` (registration + the
 * TEE handler) but does NOT invoke the CRE `Runner` -- see `main.ts` for the
 * few lines that actually run this workflow, and the note at the bottom of
 * this file for why that split matters for testability.
 */
import { cre, handlerInTee, hexToBase64, type TeeRuntime, type Workflow } from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { z } from "zod";
import { shouldDefend, sizeDefense } from "./src/decision";

// ─── Config Schema ────────────────────────────────────────────────────────
// Non-secret workflow configuration, committed to git in config.*.json.
// Only *identifiers* live here -- secrets.yaml maps each id below to the env
// var / vault entry that actually holds the private policy value, and those
// values are only ever read inside the enclave, via runtime.getSecrets().
export const configSchema = z.object({
  secretsIds: z.object({
    minHealthFactorBps: z.string(),
    maxDefenseUsdc: z.string(),
    executionKeyRef: z.string(),
  }),
});
export type Config = z.infer<typeof configSchema>;

// ─── Public trigger input ───────────────────────────────────────────────--
// What the agent orchestrator (agent/src/cre/) sends on every poll tick: the
// PUBLIC riskRatio the Graph module already computed from real market data,
// plus the PUBLIC outstanding debt size it's derived from. Neither value is
// sensitive on its own -- the position and its debt are visible on-chain
// (or, for the demo fixture, on MockLendingPool) regardless of this
// workflow. What must stay private is the *policy* applied to them below.
export type DefenseInput = {
  riskRatio: number;
  debtUSD: number;
};

// ─── Output: the signed authorization ───────────────────────────────────--
// `agent/src/index.ts` submits this to `WatchmanVault.executeDefense`. The
// boolean + amount are the only things that ever cross out of the enclave.
export type DefenseAuthorization = {
  shouldDefend: boolean;
  defenseAmountUsdc: number;
};

const decodeHttpPayload = (input: Uint8Array): DefenseInput => {
  const raw = Buffer.from(input).toString("utf-8");
  if (!raw) {
    throw new Error('empty HTTP trigger payload: expected JSON {"riskRatio": number, "debtUSD": number}');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON in HTTP trigger payload: ${message}; body=${raw}`);
  }

  const row = (parsed ?? {}) as Partial<DefenseInput>;
  const riskRatio = Number(row.riskRatio);
  const debtUSD = Number(row.debtUSD);
  if (!Number.isFinite(riskRatio) || !Number.isFinite(debtUSD)) {
    throw new Error(`HTTP trigger payload must contain finite riskRatio and debtUSD: ${raw}`);
  }
  return { riskRatio, debtUSD };
};

/**
 * TEE handler. Everything from `runtime.getSecrets(...)` through the call
 * into `shouldDefend`/`sizeDefense` runs inside the enclave. The private
 * policy values (`minHealthFactorBps`, `maxDefenseUsdc`, the execution key
 * reference) never leave it and are never logged -- only the final boolean
 * decision and sized USDC amount cross back out via `usingTheDons()`.
 *
 * Step numbering below matches Chainlink's own "Making a Workflow
 * Confidential" guide (register -> fetch secret -> compute -> cross back).
 */
export const onDefenseTrigger = (runtime: TeeRuntime<Config>, payload: { input: Uint8Array }): string => {
  // Public input: this arrived over the HTTP trigger from the agent
  // orchestrator's poll loop, already computed from public market data.
  const { riskRatio, debtUSD } = decodeHttpPayload(payload.input);
  const { secretsIds } = runtime.config;

  // ── Step 2: fetch the private policy from inside the enclave ──
  // The Vault DON releases these only into an attested enclave, decrypted
  // at the moment this call runs. Nothing about them appears in the
  // workflow's config, its logs, or its published binary.
  const secrets = runtime
    .getSecrets([
      { id: secretsIds.minHealthFactorBps },
      { id: secretsIds.maxDefenseUsdc },
      { id: secretsIds.executionKeyRef },
    ])
    .result();

  const minHealthFactorBps = Number(secrets[secretsIds.minHealthFactorBps].value);
  const maxDefenseUsdc = Number(secrets[secretsIds.maxDefenseUsdc].value);
  // The execution key reference identifies which agent wallet/credential is
  // authorized to sign the resulting on-chain defense transaction. This
  // workflow only needs to prove the enclave can resolve it -- a
  // deployment that also signs from inside the enclave would use its value
  // here to fetch the actual signing credential via a further confidential
  // capability call. It is deliberately never read into a variable that
  // gets logged or crosses `usingTheDons()`.
  const executionKeyRefResolved = typeof secrets[secretsIds.executionKeyRef].value === "string";

  if (!Number.isFinite(minHealthFactorBps) || !Number.isFinite(maxDefenseUsdc)) {
    throw new Error("policy secrets did not resolve to finite numbers");
  }

  // ── Step 3: pure decision logic over the now-confidential policy ──
  // Framework-free, unit-tested independently in test/decision.test.ts --
  // this call is the entire reason the private policy needed to be pulled
  // into the enclave in the first place.
  const authorize = shouldDefend(riskRatio, minHealthFactorBps);
  const defenseAmountUsdc = authorize ? sizeDefense(riskRatio, debtUSD, maxDefenseUsdc) : 0;

  // Simulation-only. Deliberately logs the PUBLIC riskRatio and the final
  // decision -- never the threshold, the cap, or whether the key reference
  // resolved to what. Every `runtime.log()` inside a TEE handler must be
  // removed before a production deploy; the simulator surfaces them for
  // debugging only and real execution never lets them leave the enclave.
  runtime.log(
    `defense-decision riskRatio=${riskRatio.toFixed(4)} debtUSD=${debtUSD.toFixed(2)} ` +
      `shouldDefend=${authorize} defenseAmountUsdc=${defenseAmountUsdc.toFixed(2)} ` +
      `executionKeyResolved=${executionKeyRefResolved}`,
  );

  // ── Step 4: cross back to the DON for anything needing consensus ──
  // `usingTheDons()` is a one-way door: only the two output fields below
  // are passed into it, so only they become part of the consensus-signed
  // report. The private policy values never touch this runtime.
  const donRuntime = runtime.usingTheDons();
  const encodedPayload = encodeAbiParameters(parseAbiParameters("bool shouldDefend, uint256 defenseAmountUsdcMicros"), [
    authorize,
    // USDC on Arc is 6-decimal, matching WatchmanVault.executeDefense's
    // expected amount units.
    BigInt(Math.round(defenseAmountUsdc * 1_000_000)),
  ]);

  donRuntime
    .report({
      encodedPayload: hexToBase64(encodedPayload),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const authorization: DefenseAuthorization = { shouldDefend: authorize, defenseAmountUsdc };
  return JSON.stringify(authorization);
};

export const initWorkflow = (config: Config): Workflow<Config> => {
  if (!config.secretsIds?.minHealthFactorBps || !config.secretsIds?.maxDefenseUsdc || !config.secretsIds?.executionKeyRef) {
    throw new Error(
      "config requires secretsIds.minHealthFactorBps, secretsIds.maxDefenseUsdc, and secretsIds.executionKeyRef " +
        "(see secrets.yaml for how each id maps to an env var / vault entry)",
    );
  }

  // HTTP trigger: the agent orchestrator (agent/src/cre/) POSTs
  // { riskRatio, debtUSD } on every poll tick. `{}` accepts requests from
  // any signer -- tighten with `authorizedKeys` once the agent's execution
  // key is known, ahead of a real deploy.
  const httpTrigger = new cre.capabilities.HTTPCapability();

  return [handlerInTee(httpTrigger.trigger({}), onDefenseTrigger, {})];
};

// Note: the Runner/`main()` glue that actually invokes this workflow lives
// in `main.ts`, deliberately kept out of this file. Importing this module
// (as workflow.test.ts and the pure-logic split do) must never trigger
// `Runner.newRunner()`, which requires the real CRE WASM host runtime
// (`switchModes`, `callCapability`, etc. on `globalThis`) and throws
// immediately outside of it -- confirmed while building this workflow, see
// README.md "Toolchain findings". This mirrors Chainlink's own official
// confidential-workflow templates, which split "workflow.ts" (logic,
// testable) from "main.ts" (thin entry point) for exactly this reason.
