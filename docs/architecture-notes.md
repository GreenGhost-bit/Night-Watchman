# Lamplighter

Architecture and design notes for ETHOnline 2026. The user-facing overview is
in the root `README.md`; this document records the reasoning behind specific
design decisions and the component-level specs.

---

## 1. The one-sentence pitch

A TypeScript agent watches real lending-market health factors across Aave v3, Compound v3, Morpho Blue, and Spark through **one GraphQL query pattern** against The Graph's Messari-standardized subgraphs, and defends a live demo position on **Arc** with real USDC the moment risk crosses a threshold — where the threshold and defense strategy itself are sealed inside a **Chainlink CRE Confidential Workflow** so nothing about the defense logic is visible on-chain or front-runnable.

## 2. Why the architecture is shaped this way

Two different chains are involved and that's deliberate, not sloppy:

- **The watchtower is real and read-only.** Aave v3 / Compound v3 / Morpho Blue / Spark live on Ethereum mainnet and L2s, not on Arc. We are not going to touch real users' real debt positions during a hackathon demo. So the dashboard's "Watchtower" view shows **live, real, unmodified** health-factor data for real markets via The Graph — this is the composability story, 100% honest, zero simulation.
- **The defended position is a demo fixture we control, deployed on Arc.** You cannot force a live liquidation event in someone else's Aave position on demand for judges. So we deploy our own tiny lending pool (`MockLendingPool.sol`) on Arc testnet, seed it with a real ETH-collateral/USDC-debt position, and give ourselves a button to crash the price feed live during the demo. The agent's defense of *this* position is a **real on-chain Arc transaction with real testnet USDC**, using the exact same risk-scoring code path as the watchtower. Nothing about the defense mechanism is fake — only the market data feeding the demo's specific position is self-supplied, and we say so plainly in the README and demo narration. This is also literally the shape of Chainlink's **Automated Liquidation Protection Challenge** (protect a virtual ETH-collateral/USDC-debt position during simulated market movement) — same fixture serves both.

Why not just use real Aave? Because manufacturing a live liquidation event in a real Aave position for a three-minute demo means either putting real capital at risk or running a mainnet fork nobody else can interact with. A self-controlled pool is the standard pattern for this problem.

## 3. Repo layout

```
ETHGlobal Hackathon 2026/
  docs/architecture-notes.md                 <- this file
  .env.example                <- every env var, marked [ACCOUNT] vs [LOCAL/SAFE]
  tools/                       <- gitignored: forge.exe, cast.exe, anvil.exe, cre.exe (see tools/README.md)
  contracts/                   <- Foundry project
    src/
      WatchmanVault.sol
      MockLendingPool.sol
      MockPriceFeed.sol
      MockWETH.sol
      MockUSDC.sol                        <- Sepolia-only debt asset (Arc uses real native USDC)
      interfaces/{IProtocolAdapter,IHealthFactorSource}.sol
      adapters/MockLendingPoolAdapter.sol
    script/
      DeployArc.s.sol
      DeploySepolia.s.sol
      SeedLocalDemo.s.sol                 <- opens + funds a live, defendable demo position
    test/
      WatchmanVault.t.sol
      MockLendingPool.t.sol
      Integration.t.sol
  agent/                        <- TypeScript orchestrator
    src/
      graph/                    <- Messari subgraph GraphQL client + normalization (+ SUBGRAPH_NOTES.md)
      risk/                     <- shared risk-scoring formula (pure functions, unit tested)
      chain/                    <- viem clients (Arc/Sepolia/local anvil), ABIs, vault read/write
      cre/                      <- vendored pure decision logic + evaluateDefense (local CRE stand-in)
      api/                      <- REST + WebSocket server for the frontend
      config.ts                 <- watchlist/demo-user/polling env config
      index.ts                  <- main poll loop (exports `pollOnce` for integration testing)
    scripts/integration-check.ts <- one-shot proof: seeded position -> crash -> defense -> assert
    test/
  cre-workflow/                  <- Chainlink CRE Confidential Workflow
    workflow.ts / main.ts
    src/decision.ts               <- pure logic (source of truth agent/src/cre/decision.ts mirrors)
    project.yaml
    test/
  frontend/                       <- Next.js dashboard
    app/{watchtower→/,vault,activity}
    components/
    lib/
  docs/
    demo-script.md               <- judge-facing walkthrough, one line per sponsor requirement
```

## 4. Prize-to-code map

| Sponsor track | Satisfied by (exact code path) |
|---|---|
| Graph — Composable/Standardized Products | `agent/src/graph/` querying Messari-schema subgraphs across 4 protocols with one query shape |
| Arc — Agentic Economy (Circle Agent Stack) | `contracts/src/WatchmanVault.sol` + `agent/src/chain/arc.ts` — agent wallet holding/spending USDC on real signals |
| Chainlink — Best Confidential Workflow | `cre-workflow/workflow.ts` — TEE handler holding the private defense policy |
| Chainlink — Liquidation Protection Challenge | Same workflow, registered against `MockLendingPool`'s ETH-collateral/USDC-debt fixture |
| ENS — Best Use of ENSv2 (stretch) | Agent reads its own risk thresholds from an ENSv2 text record (central use, not cosmetic) |
| Bazantic — Best Recipe (stretch) | `bazantic/recipe.json` wrapping "check + defend" as an MCP-callable tool |

## 5. Component specs

### 5.1 Contracts (Foundry, Solidity 0.8.26, target: Arc testnet chain 5042002)

Arc testnet: RPC `https://rpc.testnet.arc.network`, USDC (native gas + ERC20, 6 decimals) at `0x3600000000000000000000000000000000000000`, explorer `https://testnet.arcscan.app`, faucet `https://faucet.circle.com`. Deploy with `forge create`/`forge script`, never `foundryup` — the binaries in `tools/foundry/` are already extracted and version-pinned (v1.8.1).

**`WatchmanVault.sol`**
- `deposit(uint256 amount)` — user deposits USDC (pulled via `transferFrom`).
- `withdraw(uint256 amount)` — user withdraws their own unspent balance.
- `authorizeAgent(address agent)` / `revokeAgent(address agent)` — per-user allowlist of who may spend on their behalf.
- `setPolicy(uint256 maxSpendPerTx, uint256 maxSpendPerDay, uint256 minHealthFactorBps)` — user-set safety caps. This is the human-in-the-loop safety layer: the user, not the agent, sets the limits.
- `executeDefense(address user, address adapter, address pool, uint256 amount, string calldata reason)` — `onlyAuthorizedAgent(user)`; enforces policy caps; calls `IProtocolAdapter(adapter).defend(pool, user, amount)`; emits `DefenseExecuted(user, adapter, pool, amount, reason, block.timestamp)`.
- Reentrancy-guarded, OpenZeppelin `Ownable` + custom per-user authorization mapping (not global owner-only).

**`IProtocolAdapter.sol`** — `function defend(address pool, address user, uint256 amount) external returns (bool)`.

**`MockLendingPoolAdapter.sol`** — implements the interface, calls `MockLendingPool.repayFor` or `addCollateralFor`.

**`MockLendingPool.sol`** — minimal single-market pool: `depositCollateral(uint256 wethAmount)`, `borrow(uint256 usdcAmount)`, `repayFor(address user, uint256 usdcAmount)`, `addCollateralFor(address user, uint256 wethAmount)`, `liquidate(address user)` (callable by anyone once `healthFactor(user) < 1e18`), `healthFactor(address user) view returns (uint256)` computed as `(collateralWeth * price * liqThresholdBps) / (debtUsdc * 10000)`. Price comes from `MockPriceFeed`.

**`MockPriceFeed.sol`** — `setPrice(uint256 newPrice)` owner-only (this is the demo's "crash the market" button, called from the frontend's admin panel during the live demo). Clearly commented as a demo fixture, not presented as a real Chainlink feed.

**`MockWETH.sol`** — mintable ERC20 for demo collateral only.

Tests must cover: deposit/withdraw, policy cap enforcement (reject over-cap spend), full liquidation-defense happy path (price drop → HF < threshold → executeDefense → HF restored above threshold), and the negative case (unauthorized agent reverts). Run everything against **anvil**, never a live network, until the user explicitly deploys.

### 5.2 Agent — Graph module (`agent/src/graph/`)

One shared GraphQL query shape against Messari's standardized lending schema, parameterized only by subgraph ID:

```graphql
query MarketRisk($account: String!) {
  account(id: $account) {
    positions(where: { balance_gt: "0" }) {
      market { name inputToken { symbol } liquidationThreshold }
      balanceUSD
      side # COLLATERAL | BORROWER
    }
  }
}
```

Normalize every protocol's response into:
```ts
interface PositionRisk {
  protocol: "aave-v3" | "compound-v3" | "morpho-blue" | "spark";
  account: string;
  collateralUSD: number;
  debtUSD: number;
  liquidationThresholdBps: number;
  riskRatio: number; // debtUSD / (collateralUSD * liquidationThresholdBps / 10000) — same formula, every protocol
}
```
`riskRatio >= 1` means liquidatable. This single formula across four schemas **is** the composability submission — do not build protocol-specific scoring logic.

Must run in two modes: `live` (real query via `https://gateway.thegraph.com/api/{THE_GRAPH_API_KEY}/subgraphs/id/{id}`) and `fixture` (reads a committed JSON fixture) so the whole agent is testable and demoable with zero external credentials while `THE_GRAPH_API_KEY` is still pending.

### 5.3 CRE Confidential Workflow (`cre-workflow/`)

Requirements, independent of the exact SDK surface:

- Register a confidential TEE handler.
- Input: the computed `riskRatio` (public — it's derived from public market data) plus the **private** policy: `minHealthFactorBps`, `maxDefenseUsdc`, and the agent's execution key/credential. The private policy is what must live inside the enclave — that's the actual Confidential Workflow requirement, and it's also the point: nobody watching the mempool should be able to read the exact trigger threshold and front-run the defense.
- Output: a signed authorization (`shouldDefend: bool`, `defenseAmountUsdc: uint256`) that `agent/src/index.ts` submits to `WatchmanVault.executeDefense`.
- Extract the pure decision logic (`shouldDefend()`, `sizeDefense()`) into plain, unit-testable TypeScript functions separate from the CRE runtime wrapper, so correctness is provable via a normal test runner even before the workflow is registered/deployed against a live CRE account.
- Actually running `cre login` / `cre workflow deploy` against a real account is a **manual, user-owned step** — build to the point where `cre workflow simulate` (local, no account needed) passes, then stop and document the deploy command for the user to run themselves.

### 5.4 Agent orchestrator (`agent/src/index.ts`)

Poll loop (`AGENT_POLL_INTERVAL_MS`): query Graph module (watchtower) + read `MockLendingPool.healthFactor()` on Arc (demo fixture) → compute `riskRatio` for both → feed into CRE workflow client → on `shouldDefend`, call `WatchmanVault.executeDefense` via viem → log every decision (including "no action needed") to an in-memory ring buffer exposed over the API. Expose:
- `GET /api/watchtower` — live array of `PositionRisk` across all four protocols for a configurable watchlist of addresses.
- `GET /api/vault/:user` — demo vault state (balance, policy, current health factor).
- `GET /api/activity` — recent agent decisions/events (for the frontend's log panel).
- `WS /ws` — pushes new activity events as they happen (for the live demo, no polling flicker on stage).

### 5.5 Frontend (`frontend/`, Next.js + wagmi/viem)

Visual language: continue the noir/dossier system already established in the strategy brief — ink/graphite neutrals, amber accent as the risk/status color, Barlow Condensed for headers, IBM Plex Mono for numbers. Three views:
1. **Watchtower** — grid of real live positions across the four protocols, color-coded by `riskRatio` (green < 0.7, amber 0.7–0.9, red ≥ 0.9), sourced from `/api/watchtower`.
2. **Demo Vault** — the live-defendable Arc position: current health factor gauge, deposit/withdraw/policy-setting UI (wagmi, Arc testnet chain config via `viem/chains` `arcTestnet`), and a judge-facing "Trigger Market Crash" button (owner-gated, calls `MockPriceFeed.setPrice`) to force the live demo moment.
3. **Activity Log** — real-time feed from `/ws`, each entry linking to `testnet.arcscan.app` for the actual transaction.

Must run against `AGENT_API_URL` with zero required external accounts — wallet connect can use a public WalletConnect project ID placeholder and still render/function for local review; only live wallet signing needs the real one.

## 6. Manual, credential-gated steps

These require accounts or funded wallets and are performed by hand, never scripted:
- Signing up for a The Graph API key, Circle Developer account, Chainlink CRE account, or Bazantic account.
- Funding any real wallet or calling `join()` on the Chainlink Sepolia challenge contract.
- Running `cre login` / `cre workflow deploy` against a live CRE account.
- Broadcasting any contract deployment to Arc testnet or Sepolia (scripts will be written and dry-run against local `anvil` only).

Everything else runs and is tested locally end-to-end without them.

## 7. Build order (3 days remaining, Sep 13 → Sep 16)

| Day | Focus |
|---|---|
| Sep 13 | Contracts complete + passing tests on anvil. Graph module querying live data (fixture mode until API key lands). CRE workflow logic scaffolded + unit tested. |
| Sep 14 | Agent orchestrator wired end-to-end against local anvil deployment. CRE workflow simulated locally. Frontend Watchtower + Demo Vault views built against the agent API. |
| Sep 15 | Full local dry run: crash price feed → agent detects → CRE authorizes → on-chain defense fires → frontend shows it live. ENSv2 + Bazantic stretch goals if time remains. Cut the demo video. |
| Sep 16 | Fill in real credentials from `.env.example`, deploy for real (user-run), submit against every row in the prize ledger. |

## 8. Definition of done — STATUS: ALL VERIFIED (2026-09-13)

- [x] `forge test` — **26/26 pass**, run from `contracts/` via `../tools/foundry/forge.exe test`.
- [x] `agent`: `npm run build` + `npm test` clean (**23/23**); `agent/scripts/integration-check.ts`
      run twice against a fresh local anvil deploy + `SeedLocalDemo.s.sol` seed — proved both the
      no-op case (healthy position, HF 1.20 → `no_action`) and the real case (price crashed to
      $2,600, HF 1.04 → a genuine `WatchmanVault.executeDefense` transaction mined on-chain, debt
      $20,000 → $15,000, HF restored to 1.39).
- [x] `cre-workflow`: pure decision-logic unit tests pass (**21/21**), plus **4/4** real-SDK tests
      via a project-local `bun` (fixed from an earlier global install — see git history).
      `cre workflow simulate` confirmed to genuinely require a live CRE login even for local
      runs — documented in `cre-workflow/README.md` as the one manual step left.
- [x] `frontend`: `npm run build` clean; all three views verified rendering (via a real browser
      check, not just curl) — Watchtower shows live cross-protocol fixture data, Vault correctly
      shows labeled example data pending wallet connection (by design) and real on-chain state
      once a wallet is connected, Activity streams over WS. One real bug was found and fixed
      during this verification: the API 500'd on a syntactically-valid but non-checksummed
      address (viem's strict EIP-55 check) — fixed via `getAddress()` normalization in
      `agent/src/chain/vault.ts`.
- [x] `docs/demo-script.md` — one line per prize requirement, plus the exact reproduction steps
      and verified numbers above.

Not done, deliberately (see section 6): no real credentials were created, no live-network
deployment was broadcast, `cre login` was never run. Everything above was verified against local
anvil + a project-local CRE SDK/simulator — flipping to live mode is purely filling in `.env`.
