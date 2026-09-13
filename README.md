# The Night Watchman

An autonomous agent that watches leveraged lending positions across multiple
protocols and defends one before it gets liquidated — with the trigger policy
sealed inside a Chainlink CRE Confidential Workflow so it can't be front-run.

Built for ETHOnline 2026.

---

## The problem

A leveraged borrower posts ETH as collateral and borrows USDC against it. If
ETH's price falls far enough, their *health factor* drops below 1.0 and anyone
can liquidate them — seizing the collateral at a discount. This happens at 3am
while the borrower is asleep.

The obvious fix is a bot that repays part of the debt when risk rises. The
non-obvious problem is that **a bot with a public trigger threshold is itself
an attack surface**: if everyone can read "defends at HF 1.10", a liquidator
just pushes the price to 1.11 and waits.

## The approach

```
   The Graph                    Chainlink CRE                 Arc
┌────────────────┐          ┌──────────────────┐      ┌────────────────┐
│  Aave v3       │          │  TEE handler     │      │ WatchmanVault  │
│  Compound v3   │─ risk ──▶│  ┌────────────┐  │─ ok ▶│  policy caps   │
│  Spark         │  ratio   │  │ private:   │  │      │  per-user auth │
│  (Seamless)    │          │  │ threshold  │  │      └───────┬────────┘
└────────────────┘          │  │ max spend  │  │              │
   one query shape          │  └────────────┘  │              ▼
   one formula              └──────────────────┘      repay debt, HF ↑
```

**1. Watch — one query, many protocols.** Every lending market is queried with
a single GraphQL shape against The Graph's Messari-standardized subgraphs, and
scored with one formula:

```
riskRatio = debtUSD / (collateralUSD × liquidationThreshold)
```

`riskRatio >= 1` means liquidatable. There is no protocol-specific scoring code
anywhere — that sameness across four independent protocols is the point.

**2. Decide — privately.** The risk ratio is public (it's derived from public
market data). The *policy* — trigger threshold, maximum capital per defense,
execution credential — lives inside a TEE handler and never appears on-chain or
in a log. Nobody watching the mempool can read the line they'd need to game.

**3. Defend — within limits the user set.** `WatchmanVault` custodies the
user's own USDC. The user authorizes specific agent addresses and sets their own
caps: max per transaction, max per rolling 24h, and a health-factor floor below
which a defense is even permitted. An authorized agent calls `executeDefense`,
the vault enforces all three caps, then repays debt through a protocol adapter.

**There is no global owner over user funds.** Every cap and authorization is
per-user and enforced on-chain — not a promise in a README.

## What's real, and what's a fixture

Being precise about this, because it matters:

| | Status |
|---|---|
| Watchtower risk data | **Real.** Live Aave v3 / Compound v3 / Spark positions on mainnet via The Graph. Read-only, unmodified. |
| Defense mechanism | **Real.** Real on-chain transaction, real USDC, real policy enforcement. |
| The defended position | **Our own fixture.** A `MockLendingPool` we deploy and seed. |
| Its price feed | **Our own fixture.** Owner-settable, so a crash can be triggered on demand. |

We can't manufacture a live liquidation event in someone else's Aave position
for a three-minute demo without risking real capital. So the *position* is a
fixture we control — but the code path that defends it is the same one that
scores the real positions on the Watchtower. Only the market data feeding this
one position is self-supplied.

This is also the exact shape the Chainlink Automated Liquidation Protection
Challenge asks for: protect a virtual ETH-collateral/USDC-debt position through
simulated market movement.

## Layout

```
contracts/      Foundry — WatchmanVault, MockLendingPool, adapters, deploy scripts
agent/          TypeScript — Graph client, risk scoring, chain layer, API, poll loop
cre-workflow/   Chainlink CRE Confidential Workflow holding the private policy
frontend/       Next.js dashboard — Watchtower, Vault, Activity
docs/           Demo walkthrough and architecture notes
```

## Running it

Needs no accounts — fixture mode and local anvil work offline.

```bash
# toolchain (see tools/README.md)
./tools/foundry/forge --version

# contracts
cd contracts && ../tools/foundry/forge install && ../tools/foundry/forge test

# agent
cd agent && npm install && npm test

# CRE workflow logic
cd cre-workflow && npm install && npm test

# dashboard
cd frontend && npm install && npm run dev
```

For the full local run — deploy, seed a position, crash the price, watch the
agent defend it — see `docs/demo-script.md`.

## Verified end to end

Against local anvil, reproducible via `contracts/script/SeedLocalDemo.s.sol`
and `agent/scripts/integration-check.ts`:

- Healthy position (HF 1.20) → agent takes **no action**.
- Price crashed $3,000 → $2,600 (HF 1.04) → defense authorized, real transaction
  mined, debt $20,000 → $15,000, **HF restored to 1.39**.

Test suites: contracts 26/26, agent 27/27, CRE workflow 21/21 pure logic + 4/4
against the real SDK.

## Live on Arc testnet

Deployed and running against Arc testnet (chain 5042002). Every address and
transaction below is independently verifiable on
[Arcscan](https://testnet.arcscan.app).

| Contract | Address |
|---|---|
| WatchmanVault | [`0x622662b7e046eb40da12BCeDB890CA90238E87D0`](https://testnet.arcscan.app/address/0x622662b7e046eb40da12BCeDB890CA90238E87D0) |
| MockLendingPool | [`0xe8c3D77fa5372552138424119CB1b61C898b00D3`](https://testnet.arcscan.app/address/0xe8c3D77fa5372552138424119CB1b61C898b00D3) |
| MockLendingPoolAdapter | [`0x980ED9C5636Adeb726E70F04aD5C81C96EeF8b64`](https://testnet.arcscan.app/address/0x980ED9C5636Adeb726E70F04aD5C81C96EeF8b64) |
| MockPriceFeed | [`0xC791288176d216EA5ca12bebE63B8c70Ea3705ef`](https://testnet.arcscan.app/address/0xC791288176d216EA5ca12bebE63B8c70Ea3705ef) |
| MockWETH | [`0x2F5ce5d5F73AbeDA7d8e25083Ee6139413DB2720`](https://testnet.arcscan.app/address/0x2F5ce5d5F73AbeDA7d8e25083Ee6139413DB2720) |

**The defense transaction:**
[`0xde151c5f0c5e770613f448b558db2cf9dae8cd6eeff0ba6b9e6485180b077046`](https://testnet.arcscan.app/tx/0xde151c5f0c5e770613f448b558db2cf9dae8cd6eeff0ba6b9e6485180b077046)

The sequence, on-chain:

1. Position opened: 0.005 WETH collateral @ $3,000, $10 USDC debt -> **HF 1.20**
2. Price feed crashed to $2,600 -> **HF 1.04**, below the 1.10 policy floor
3. Agent detected it, the confidential workflow authorized a $2.50 defense
4. `WatchmanVault.executeDefense` repaid the debt -> $7.50 -> **HF 1.386**

The agent wallet (`0xc87401C48E6cE9dBD60dDA9151631e8AC920F5b4`) is deliberately
a different address from the position owner, so the vault's per-user
`authorizeAgent` boundary is exercised rather than assumed.

Amounts are sized to a testnet faucet balance. The health factors, policy
enforcement, and code path are identical at any scale.

## Known limitations

- **Seamless's subgraph is currently down** — its indexers return HTTP 400 on
  every query. The Watchtower reports it as degraded and keeps serving the other
  three protocols rather than failing closed. Morpho Blue's Messari subgraph was
  never published to the decentralized network (see
  `agent/src/graph/SUBGRAPH_NOTES.md`).
- The price feed is a demo fixture, not a real Chainlink feed. Labeled as such
  in the contract and the UI.
- `cre workflow simulate` requires a live CRE login even for local runs; the
  pure decision logic is unit-tested independently of the runtime.
