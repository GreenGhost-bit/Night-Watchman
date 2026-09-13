# The Night Watchman — Contracts

Foundry project for the on-chain half of The Night Watchman (ETHOnline 2026). See the root
`PROJECT.md` for full system context — in short: the off-chain risk agent and Chainlink CRE
workflow watch **real** lending-market health factors on mainnet/L2 protocols via The Graph
(read-only, untouched), while this `contracts/` directory is a **self-controlled demo fixture**
deployed on Arc (and Sepolia, for the Chainlink Automated Liquidation Protection Challenge) that
lets us manufacture a live liquidation-risk moment and defend it with a real on-chain
transaction, using the same defense mechanism end to end.

## Contracts (`src/`)

- **`WatchmanVault.sol`** — Custodies each user's own USDC and is the human-in-the-loop safety
  layer of the whole system. A user deposits USDC (`deposit`/`withdraw`), authorizes specific
  agent addresses to spend on their behalf (`authorizeAgent`/`revokeAgent`), and sets their own
  safety policy (`setPolicy(maxSpendPerTx, maxSpendPerDay, minHealthFactorBps)`). An authorized
  agent can then call `executeDefense(user, adapter, pool, amount, reason)`, which enforces the
  per-tx cap, a rolling 24h per-day cap, and a check that the pool's reported health factor is
  actually below the user's configured floor, before transferring USDC to `adapter` and calling
  `IProtocolAdapter(adapter).defend(pool, user, amount)`. Emits `DefenseExecuted` on success.
  Reentrancy-guarded (OpenZeppelin `ReentrancyGuard`) and uses `SafeERC20` for all token moves.
  There is no global owner over user funds — every cap and authorization is per-user.

- **`interfaces/IProtocolAdapter.sol`** — The one-function interface (`defend(pool, user,
  amount) returns (bool)`) `WatchmanVault` calls into. Any lending protocol integration can
  implement this without `WatchmanVault` knowing anything protocol-specific.

- **`interfaces/IHealthFactorSource.sol`** — The minimal read interface (`healthFactor(user)
  returns (uint256)`) `WatchmanVault` calls before spending, so it never triggers a defense a
  position doesn't actually need.

- **`adapters/MockLendingPoolAdapter.sol`** — Implements `IProtocolAdapter` for
  `MockLendingPool`. Translates `defend()` into a debt repayment (`repayFor`) — repay-debt was
  chosen as the primary defense action over adding collateral because it's the most legible
  "we saved the position" story for a live demo: the health factor visibly jumps the moment the
  repay lands.

- **`MockLendingPool.sol`** — A minimal single-market lending pool representing exactly one
  ETH-collateral / USDC-debt position: `depositCollateral`, `borrow`, `repayFor` (callable by
  any adapter — this is what `WatchmanVault`'s defense calls into), `addCollateralFor`,
  `liquidate` (callable by anyone once `healthFactor(user) < 1e18`, standard
  repay-and-seize-with-bonus liquidation), and `healthFactor(user)` computed as
  `(collateralWeth * price * liqThresholdBps) / (debtUsdc * 10000)`, normalized to a 1e18 fixed
  point scale. This doubles as the fixture for the Chainlink Automated Liquidation Protection
  Challenge on Sepolia.

- **`MockPriceFeed.sol`** — A trivial owner-settable price oracle (`setPrice`/`getPrice`,
  18-decimal price). **This is a demo-only fixture, not a real Chainlink price feed** — it's
  the frontend's judge-facing "crash the market" button. The actual Chainlink integration is
  the separate `cre-workflow/` Confidential Workflow workstream.

- **`MockWETH.sol`** — Minimal mintable 18-decimal ERC20 standing in for WETH collateral.
  `mint` is open to anyone since it's a valueless testnet demo token.

- **`MockUSDC.sol`** — Minimal mintable 6-decimal ERC20, used **only** as the default debt
  asset for the Sepolia deploy script (Sepolia has no chain-native USDC the way Arc does — see
  the contract's NatSpec for how to point at a real testnet USDC instead).

- **`SeedLocalDemo.s.sol`** — Not part of the demo-fixture contracts above; a broadcast script
  that seeds a full live position on top of an already-deployed `DeploySepolia.s.sol` stack
  (10 WETH collateral, $20,000 USDC debt → health factor 1.20, a $5,000 `WatchmanVault` reserve,
  the agent authorized, and policy set to defend at HF ≤ 1.10). This is what turns a bare
  deployment into something the agent orchestrator (`agent/`) can actually poll and defend — see
  "Local dry run" below for the full sequence. **Local/demo use only**, never run against a real
  network with real value: step 1 mints USDC directly into the pool to give it lending
  liquidity, which only works because `MockUSDC` is our own mintable token.

### A gotcha worth knowing: `MockLendingPool` has no liquidity of its own

`MockLendingPool` is deliberately minimal — it has no `supply()`/lender-side function. A freshly
deployed pool holds zero USDC, so the very first `borrow()` call against it will revert with
`ERC20InsufficientBalance` until *something* funds the pool with USDC to lend out.
`SeedLocalDemo.s.sol` handles this automatically for local dev (`usdc.mint(address(pool), ...)`,
only possible because Sepolia's default deploy uses our own mintable `MockUSDC`). On Arc, where
the debt asset is the real native USDC, there is no mint function to reach for — the pool must
instead be funded by acquiring real testnet USDC from https://faucet.circle.com and transferring
it in directly.

## Deviations from the original spec

- **No `Ownable` on `WatchmanVault`.** The spec text mentions "OpenZeppelin `Ownable` + custom
  per-user authorization," but the vault has no owner-gated function anywhere in its
  functional spec (every cap/authorization is per-user, by design — "not global owner-only").
  Adding an unused `Ownable` would just be dead weight and an unused-import warning, so it was
  left out.
- **`MockUSDC.sol` added** (not in the original file list) purely so `DeploySepolia.s.sol` has
  a debt asset to deploy by default, since — unlike Arc — Sepolia has no canonical native USDC
  address to hardcode from memory. It's skipped entirely if you set `SEPOLIA_USDC_ADDRESS`.
- **`foundry.toml` gained a `[lint]` section** excluding three rules (`missing-events-access-
  control`, `block-timestamp`, `reentrancy-events`) that are false positives for this codebase's
  intentional design (see the comments above `exclude_lints` in `foundry.toml` for the
  reasoning on each). All other lint findings were fixed directly in the code, and
  `forge build` is warning-free.

## Toolchain

Foundry is **not** installed globally — the binaries live at `../tools/foundry/` relative to
this directory. Always invoke them with that explicit path; never use a bare `forge`/`cast`/
`anvil`/`chisel`, and never run `foundryup`.

### Build

```sh
../tools/foundry/forge.exe build
```

### Test

```sh
../tools/foundry/forge.exe test -vvv
```

### Format

```sh
../tools/foundry/forge.exe fmt
```

### Local dry run against anvil (never a live network)

```sh
# Terminal 1
../tools/foundry/anvil.exe

# Terminal 2 — anvil's well-known default test key, safe/public, zero real value
export ARC_DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
../tools/foundry/forge.exe script script/DeployArc.s.sol:DeployArc \
  --rpc-url http://127.0.0.1:8545 --broadcast -vvv

export SEPOLIA_DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
../tools/foundry/forge.exe script script/DeploySepolia.s.sol:DeploySepolia \
  --rpc-url http://127.0.0.1:8545 --broadcast -vvv

# Then seed a live, defendable position on top of that Sepolia-shaped deployment (fill in the
# addresses it just printed — anvil's account #0/#1 addresses shown are its well-known defaults):
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export AGENT_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
export MOCK_WETH_ADDRESS=<printed above> USDC_ADDRESS=<printed above>
export MOCK_LENDING_POOL_ADDRESS=<printed above> WATCHMAN_VAULT_ADDRESS=<printed above>
../tools/foundry/forge.exe script script/SeedLocalDemo.s.sol:SeedLocalDemo \
  --rpc-url http://127.0.0.1:8545 --broadcast -vvv
```

See root `docs/demo-script.md` for the full judge-facing walkthrough this feeds into.

### Deploying for real (manual, user-run step — never done automatically)

Fill in the real values from the root `.env.example` (`ARC_TESTNET_RPC_URL` /
`ARC_DEPLOYER_PRIVATE_KEY`, or `SEPOLIA_RPC_URL` / `SEPOLIA_DEPLOYER_PRIVATE_KEY`), fund the
deployer with real testnet gas/USDC, then run the same script commands above with
`--rpc-url arc_testnet` or `--rpc-url sepolia` (both aliases are already wired in
`foundry.toml`'s `[rpc_endpoints]` to read from those env vars) in place of the local anvil
URL. Neither script performs any token transfers/approvals itself — they only deploy and wire
contracts together — so broadcasting is the only extra thing that happens on a real network.

### Cast (contract interaction / queries)

```sh
../tools/foundry/cast.exe call <address> "healthFactor(address)(uint256)" <user> --rpc-url http://127.0.0.1:8545
```
