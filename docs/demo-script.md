# Lamplighter — demo script

A judge-facing walkthrough, verified end-to-end against local anvil (see "Proof it works" at the
bottom for the exact commands that produced these numbers). Each beat below names the prize
requirement it satisfies — this is also your submission-form cheat sheet.

## Setup (before judges arrive)

1. `contracts/`: start anvil, run `DeploySepolia.s.sol` (or `DeployArc.s.sol` on real Arc),
   then `SeedLocalDemo.s.sol` — see `contracts/README.md`. This opens a 10 WETH / $20,000 USDC
   position at health factor 1.20 and authorizes the agent with a policy that defends at HF ≤ 1.10.
2. Fill the printed addresses into `agent/.env` and `frontend/.env.local`.
3. `agent/`: `npm run dev` — starts the poll loop + API on :4000.
4. `frontend/`: `npm run dev` — dashboard on :3000 (or next free port).
5. Open `/watchtower`, `/vault`, `/activity` in three tabs, or just `/vault` if short on screen space.

## The narration

**1. "This is a lamplighter for your leveraged position — and everyone else's."**
Open `/watchtower`. Point at the live grid: real Aave v3, Compound v3, Spark, and Seamless
(substituting for Morpho Blue — see `agent/src/graph/SUBGRAPH_NOTES.md`) positions, colour-coded
by risk. *"One GraphQL query shape, four different lending protocols, zero protocol-specific
code — that sameness is the whole point."*
→ **The Graph: Best Use of Composable or Standardized Graph Products.**

**2. "Now here's the position it can actually defend."**
Switch to `/vault`. Show the healthy position: HF 1.20, $5,000 sitting in the vault's insurance
reserve, policy caps visible (max $5,000/tx, defend at HF ≤ 1.10). *"The agent can never spend
more than the position's own owner authorized — that cap is on-chain, not a promise."*
→ **Arc: Best Agentic Economy Application** (agent wallet + USDC, policy-capped) — narrate the
human-in-the-loop safety layer explicitly here, it's what judges look for in agent submissions.

**3. "Let's crash the market."**
Click **Trigger Market Crash** (owner wallet connected). Price drops from $3,000 → $2,600.
Health factor visibly falls to 1.04 — below the 1.10 trigger.
*"The threshold you just saw me set — that number is exactly what a Chainlink CRE Confidential
Workflow keeps private in production, so nobody watching this transaction could have front-run
it by nudging the price just short of the line."*
→ **Chainlink: Best Confidential Workflow** (the private policy/threshold live inside a TEE
handler — point at `cre-workflow/workflow.ts` and its README if asked how) **and the Automated
Liquidation Protection Challenge** (same ETH-collateral/USDC-debt fixture, same workflow).

**4. "Watch the agent react — no human clicked anything."**
Switch to `/activity`. Within one poll cycle (≤15s), a `defense_executed` event appears with a
real Arcscan-linked transaction hash. Flip back to `/vault`: debt dropped from $20,000 to
$15,000, health factor restored to 1.39.
*"That transaction is real. Everything you just watched — the risk score, the private threshold
check, the on-chain repay — is the same code path whether the position is this demo fixture or
someone's real Aave position on the Watchtower."*

**5. (If time allows) "And it wraps into infrastructure other agents can use."**
Show the Bazantic Recipe / ENSv2 identity, if built — frame as: *"an agent economy needs
discoverable, well-described tools and durable identity, not just one good demo."*

## Prize-requirement checklist (say the exact phrase judges are scoring for)

| Say this | Because |
|---|---|
| "Same query, same formula, four protocols" | Graph composability requirement |
| "Consumes live provider data, not mocked" | Graph "must consume live data" requirement (once `THE_GRAPH_API_KEY` is live — fixture mode is clearly labeled otherwise) |
| "Agent wallet holds USDC, spends against real signals, capped by user-set policy" | Arc Agentic Economy requirement |
| "The threshold lives inside a TEE, never in a public log or on-chain call" | Chainlink Confidential Workflow's actual point |
| "This is the ETH-collateral/USDC-debt fixture the Liquidation Protection Challenge scores against" | ties the two Chainlink prizes to one artifact |

## Proof it works (verified 2026-09-13, see git history for exact commands)

- `contracts/`: 26/26 Foundry tests pass; `SeedLocalDemo.s.sol` seeds HF 1.20 exactly as designed.
- `agent/scripts/integration-check.ts` run twice against local anvil:
  - Healthy position (HF 1.20) → `no_action`, health factor unchanged. PASS.
  - After crashing price to $2,600 (HF 1.04) → `defense_executed`, real tx mined, debt
    $20,000 → $15,000, health factor 1.04 → 1.39. PASS.
- `agent/` (23/23), `cre-workflow/` (21/21 pure-logic + 4/4 real-SDK), `frontend/` (`next build`
  clean) all pass from a fresh checkout.

## What's still manual (see docs/architecture-notes.md section 6)

Credentials deliberately left uncreated until deploy time: `THE_GRAPH_API_KEY`, a funded Arc/
Sepolia deployer wallet, `cre login`, and joining the Chainlink challenge's Sepolia contract via
`join()`. Everything above works today in fixture/local mode; flipping to live mode is filling
in `.env` values and re-running the same deploy/seed scripts against a real RPC.
