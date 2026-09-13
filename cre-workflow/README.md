# The Night Watchman — CRE Confidential Workflow

Decides whether, and how much, emergency USDC capital should defend a
liquidation-risk position — while keeping the private trigger policy
(threshold, spend cap, execution credential) inside a Chainlink CRE
Confidential Workflow's TEE, unreadable from a public mempool or the
workflow's own published config.

This one workflow is framed two ways for two different sponsor prizes (same
code, see [PROJECT.md](../PROJECT.md) sections 2 and 5.3):

1. **Chainlink "Best Confidential Workflow"** — a `handlerInTee` TEE handler
   holds `minHealthFactorBps`, `maxDefenseUsdc`, and an execution key
   reference. Nobody watching a public mempool or reading this workflow's
   registered config can learn the exact trigger threshold and front-run the
   defense — e.g. by triggering it themselves first, or nudging the oracle
   price just short of the trigger.
2. **Chainlink's Automated Liquidation Protection Challenge** — the same
   workflow protects a virtual ETH-collateral/USDC-debt position
   (`MockLendingPool` in `contracts/`) during simulated market movement,
   avoids liquidation, uses emergency capital efficiently (`sizeDefense`
   never over-spends), and keeps the protection rule + execution credential
   private (exactly the challenge's stated requirements).

## What's real here vs. what's a documented manual step

Built and **proven working end-to-end, right now, with zero CRE account**:

- The actual decision logic (`src/decision.ts`) — 21 passing unit tests.
- The CRE workflow wiring (`workflow.ts`, `main.ts`) — typechecks clean
  against the real `@chainlink/cre-sdk` v1.18.0 types, and its
  `handlerInTee` trigger-registration path is verified against the real SDK
  (not a mock) in `workflow.test.ts`.

**Genuinely blocked without a live CRE account** (confirmed by actually
running the commands, not assumed — see "Toolchain findings" below):
`cre init`, and `cre workflow simulate` / `deploy` / `activate`. Every one of
these calls the CRE control plane to validate credentials before doing
anything local. This is a hard CLI/account requirement, not a flag we
declined to pass. The exact commands to run once you have an account are in
"Manual steps for the account owner" below.

## Repository layout

```
cre-workflow/
  project.yaml            # project-level target settings (staging/production)
  workflow.yaml            # this workflow's target settings: paths + name
  secrets.yaml              # maps secret IDs -> env var names (no values)
  config.staging.json         # non-secret config: which secret IDs to use
  config.production.json
  workflow.ts                  # TEE handler + trigger registration (testable, no Runner)
  main.ts                       # thin CRE entry point: Runner.newRunner + run
  src/
    decision.ts                  # pure, framework-free shouldDefend/sizeDefense
  test/
    decision.test.ts               # vitest — proves decision.ts, no CRE needed
  workflow.test.ts                  # bun:test — proves workflow.ts wiring against
                                     # the real SDK, no CRE account needed
  .env.example / .gitignore / package.json / tsconfig.json / vitest.config.ts
```

## The real SDK (confirmed, not guessed)

- **Package**: [`@chainlink/cre-sdk`](https://www.npmjs.com/package/@chainlink/cre-sdk)
  on npm. Pinned here to `1.18.0` — see "Toolchain findings" for why not
  `latest` (1.21.0 at time of writing).
- **Confidential handler pattern**: `cre.handlerInTee(trigger, fn, teeConstraint, hooks?)`
  (or the named export `handlerInTee`, both point at the same function).
  `fn` receives a `TeeRuntime<Config>` instead of the regular `Runtime<Config>`
  a plain `cre.handler(...)` gets. Everything the `TeeRuntime` touches —
  `runtime.getSecret()` / `runtime.getSecrets()`, and any capability call
  made by passing that runtime in (e.g. `HTTPClient.sendRequest(teeRuntime, ...)`)
  — executes inside the enclave. `runtime.usingTheDons()` returns a regular
  `Runtime` and is a **one-way door**: only what you explicitly pass into a
  call on it crosses back out to Workflow DON consensus.
- **Confirmed by**: reading the actual shipped `.d.ts` files in the npm
  tarball (`dist/sdk/workflow.d.ts`, `dist/sdk/runtime.d.ts`,
  `dist/sdk/cre/index.d.ts`), and by pulling Chainlink's own
  [`cre-templates`](https://github.com/smartcontractkit/cre-templates) repo,
  which ships a `starter-templates/confidential-workflows/automated-liquidation-protection`
  template — a fuller (LLM-reasoning-based) version of exactly this use
  case — plus a minimal `hello-confidential-workflows-ts` template whose
  README documents the 4-step pattern this workflow follows: register →
  fetch secret → compute → cross back. Docs cross-checked against
  `docs.chain.link/cre/concepts/confidential-workflows` and
  `docs.chain.link/cre/reference/sdk/*`, though the `.d.ts` files and the
  official template source were the ground truth where docs and SDK
  disagreed (see below).
- **Confidential Workflows is in private beta** — per Chainlink's own
  template README: "requires enrollment through your Chainlink account
  team." A CRE account alone is not sufficient to *deploy* this; it's
  sufficient to *simulate* it (once the general login requirement below is
  also met).

## How the confidential handler is structured

`workflow.ts`:

1. **Registers a TEE handler** on an HTTP trigger:
   `handlerInTee(new cre.capabilities.HTTPCapability().trigger({}), onDefenseTrigger, {})`.
   The agent orchestrator (`agent/src/cre/`, another workstream) POSTs
   `{ riskRatio, debtUSD }` on every poll tick — both PUBLIC values already
   computed from public market data (or from `MockLendingPool` for the demo
   fixture), so there's nothing to hide about the trigger payload itself.
2. **Fetches the private policy inside the enclave**:
   `runtime.getSecrets([{id: ...}, {id: ...}, {id: ...}]).result()` pulls
   `minHealthFactorBps`, `maxDefenseUsdc`, and an `executionKeyRef` — the
   Vault DON releases these only into an attested enclave, decrypted at the
   moment the call runs. `secrets.yaml` maps each ID to an env var name;
   `.env` (gitignored) holds the actual values for local simulation.
3. **Runs the pure decision logic** — `shouldDefend(riskRatio, minHealthFactorBps)`
   and `sizeDefense(riskRatio, debtUSD, maxDefenseUsdc)` from `src/decision.ts`
   — entirely inside the enclave, over now-confidential inputs.
4. **Crosses back to the DON** via `runtime.usingTheDons()` for a
   consensus-signed report (`donRuntime.report({ encodedPayload, encoderName:
   "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })`), carrying
   *only* `{ shouldDefend, defenseAmountUsdc }` ABI-encoded — never the
   threshold, the cap, or the key reference. The function also returns that
   pair as a JSON string, which is what `cre workflow simulate` prints and
   what `agent/src/index.ts` (via `cre execution` / a real deploy's report
   delivery) ultimately submits to `WatchmanVault.executeDefense`.

The important discipline the official docs call out, and this workflow
follows: **the logic is not confidential, only the data is.** The compiled
binary — including `onDefenseTrigger`'s source — is part of what the
Workflow DON hands to the enclave, so it's visible. What's protected is the
*data* that logic reads inside the enclave: the three secrets above. That's
exactly the sensitive material for this use case (the exact trigger point
and spend cap), so the design holds.

## The pure decision logic — provable right now, no CRE needed

`src/decision.ts` has zero imports from `@chainlink/cre-sdk` or anything
else. Two functions:

```ts
function shouldDefend(riskRatio: number, minHealthFactorBps: number): boolean
function sizeDefense(riskRatio: number, debtUSD: number, maxDefenseUsdc: number): number
```

- `shouldDefend` compares in riskRatio-space: trigger once
  `riskRatio >= 10000 / minHealthFactorBps` (inclusive at the boundary) —
  equivalent to the implied health factor (`1 / riskRatio`) falling to or
  below the private policy floor.
- `sizeDefense` scales the deployed amount linearly with objective severity
  relative to the hard liquidation line (`riskRatio = 1`, independent of the
  policy's early-warning threshold), then caps it at both the private
  `maxDefenseUsdc` and the debt itself — never over-spend, never "repay"
  more than is owed.

`workflow.ts` imports and calls exactly these two functions from inside the
TEE handler; it adds no additional business logic of its own.

### Running the tests

```bash
cd cre-workflow
npm install     # or: bun install (see "Toolchain findings" for why bun works
                 # here and plain npm cannot, for the *workflow-level* deps)
npm test        # vitest — 21 tests, all passing, zero CRE dependency
npm run typecheck   # tsc --noEmit against the real @chainlink/cre-sdk types — clean
```

Confirmed passing as of this build:

```
✓ test/decision.test.ts (21 tests)
  Test Files  1 passed (1)
       Tests  21 passed (21)
```

There's a second, smaller suite, `workflow.test.ts`, that exercises the real
`handlerInTee`/trigger-registration path (not a mock) to prove the workflow
wires up to the actual SDK correctly — see "Toolchain findings" for why it
runs under `bun test` rather than `npm test`:

```bash
bun install
bun test workflow.test.ts   # or: npm run test:workflow
```

```
4 pass
0 fail
Ran 4 tests across 1 file.
```

## Toolchain findings (confirmed by actually running things, not assumed)

Three real, load-bearing constraints surfaced while building this — each
confirmed by running the actual command against `../tools/cre/cre.exe`
v1.33.0 or the actual published npm package, not by reading a claim
somewhere and repeating it:

1. **`cre init` and `cre workflow simulate` require an authenticated CRE
   account, even for a fully local run.** This was tested directly:

   ```
   $ ../tools/cre/cre.exe init --non-interactive --project-name test --template hello-confidential-workflows-ts
   ✗ Authentication required: not logged in and no CRE_API_KEY set

   $ ../tools/cre/cre.exe workflow simulate . --target staging-settings --non-interactive --http-payload '...'
   ✗ Authentication required: not logged in and no CRE_API_KEY set
   ```

   Setting a placeholder `CRE_API_KEY` doesn't help either — the CLI
   round-trips it against Chainlink's GraphQL API
   (`getCreOrganizationInfo`) before doing anything local, so a fake key
   fails with `unauthorized: invalid token`. This matches Chainlink's own
   docs ("Part 1: Project Setup" lists "Authenticated CLI session" as a
   simulate prerequisite), and it's why this repo does **not** attempt to
   run `cre workflow simulate` for real: per this project's explicit
   constraint, only the account owner runs `cre login` — see "Manual steps"
   below for the exact commands to run once that's done. Everything up to
   that boundary (the code, its types, its tests) is built and proven here.

2. **The published `@chainlink/cre-sdk@1.21.0` (npm's `latest` tag) cannot
   be installed at all** — not a network issue, a packaging bug: its
   `package.json` depends on `@chainlink/cre-sdk-javy-plugin` via
   `workspace:*`, a bun/pnpm monorepo-only protocol that only resolves
   inside the SDK's own source repo. Both `npm install` and `bun install`
   fail immediately on it. Version `1.18.0` (what every current official
   template pins) has a real, resolvable version number for that same
   dependency, so this workflow is pinned to **`1.18.0`**, not `latest`.
3. **The SDK's compiled output resolves as bun-only ESM.** Even after
   installing `1.18.0`, importing anything from `@chainlink/cre-sdk` under
   plain Node (and therefore under vitest, which runs on Node) fails:
   `Error: Directory import '.../dist/sdk' is not supported resolving ES
   modules`. Bun's resolver accepts it; Node's does not. This is exactly why
   every one of Chainlink's own official templates tests SDK-touching code
   with `bun:test`, never `vitest`/`jest`. It's also why this repo installs
   `bun` (via `npm install -g bun`, itself just an ordinary npm package — no
   external download outside the npm registry, no account) rather than
   fighting Node's resolver.

   This is also *why* the task's required split — pure logic in
   `src/decision.ts`, CRE wrapper in `workflow.ts` — matters beyond good
   practice here: `decision.ts` has no SDK import, so it's the one piece
   provable with a completely ordinary `npm test` on a machine with no bun
   and no CRE account at all.

One more thing discovered along the way, not a blocker but worth recording:
`workflow.ts` originally called `Runner.newRunner()` at module scope (matching
a plausible reading of "one entry-point file"). Importing it for tests then
throws immediately: `Error: Missing required global host functions:
switchModes, log, sendResponse, ... The CRE WASM runtime must provide these
functions on globalThis.` — `Runner.newRunner()` genuinely requires the real
CRE WASM host environment and cannot run under a plain test process. Fixed by
splitting the Runner-invoking glue into `main.ts` (a handful of lines,
`workflow.yaml`'s `workflow-path` points here) and keeping `workflow.ts` free
of any top-level `Runner` call — exactly the split Chainlink's own official
templates use (`workflow.ts` for logic, `main.ts` for the entry point), for
precisely this reason.

## Manual steps for the account owner (not run here, per this project's constraints)

Once you've signed up for a CRE account (Chainlink Confidential Workflows is
in private beta — see above; request access first if deploying):

```bash
cd cre-workflow
../tools/cre/cre.exe login
cp .env.example .env   # fill in the [ACCOUNT] rows; local policy values already have safe defaults

# Local simulation against a live account (no broadcast, no deploy):
../tools/cre/cre.exe workflow simulate . --target staging-settings \
  --http-payload '{"riskRatio": 0.9, "debtUSD": 10000}'
# (also wired up as: npm run simulate:staging)

# Only once you're ready to actually register it:
../tools/cre/cre.exe workflow deploy . --target staging-settings
../tools/cre/cre.exe workflow activate . --target staging-settings
```

`project.yaml`'s `${SEPOLIA_RPC_URL}` resolves from the root `.env.example`'s
`SEPOLIA_RPC_URL` — fill that in first if targeting Sepolia (the Automated
Liquidation Protection Challenge's chain).

## Private policy fields (what lives in the enclave, and why)

| Field | Where it's set | Why it must stay private |
|---|---|---|
| `minHealthFactorBps` | `NIGHT_WATCHMAN_MIN_HEALTH_FACTOR_BPS` via `secrets.yaml` | The exact early-warning trigger. Public knowledge lets an attacker manipulate price to land just short of it, or race a defense they can see coming. |
| `maxDefenseUsdc` | `NIGHT_WATCHMAN_MAX_DEFENSE_USDC` via `secrets.yaml` | Reveals how much emergency capital is available — useful for an attacker sizing an attack to exceed it. |
| `executionKeyRef` | `NIGHT_WATCHMAN_EXECUTION_KEY_REF` via `secrets.yaml` | Identifies which credential is authorized to execute the defense on-chain; never resolved to a loggable value. |

`riskRatio` and `debtUSD` (the trigger payload) are deliberately **not**
secrets — they're derived from public market data (or the public
`MockLendingPool` demo fixture), so hiding them would add enclave overhead
for no confidentiality benefit.
