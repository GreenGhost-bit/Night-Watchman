# Subgraph research notes

Research done 2026-09-13 for The Night Watchman's Graph module. Goal: confirm
real, live, indexed subgraph IDs on The Graph's **decentralized network**
using **Messari's standardized lending schema**, for at least three
fundamentally different lending protocols, and verify the real GraphQL field
names to query against them.

## Primary source

The authoritative source used here is Messari's own
[`messari/subgraphs`](https://github.com/messari/subgraphs) repo,
specifically `deployment/deployment.json`, which lists every protocol
Messari maintains a standardized subgraph for for, its schema version, its
`status` (`prod` / `dev`), and — where published — its
`services.decentralized-network.query-id`, which **is** the subgraph ID used
in `https://gateway.thegraph.com/api/{API_KEY}/subgraphs/id/{query-id}`.

This is more reliable than trusting a search-engine snippet or a
client-rendered Graph Explorer page (see "Verification caveats" below) —
it's the data Messari themselves publish about their own deployments.

Corroborating source: The Graph's own blog post ["How a Community Builder
Queried 90 DeFi Lending Protocols With a Single GraphQL
Query"](https://thegraph.com/blog/community-builder-queried-defi-lending-protocols-subgraphs-mcp/)
(via the `graph-lending-mcp` project's `SUBGRAPHS.md` registry) independently
names Aave v3, Compound v3, and Spark Lend Ethereum as live, `prod`-status
Messari lending subgraphs — matching what `deployment.json` shows.

## Confirmed live (used in `agent/.env.example`)

| Protocol | Decentralized network subgraph ID | Schema ver. | Status |
|---|---|---|---|
| Aave v3 (Ethereum) | `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk` | 3.1.0 | prod |
| Compound v3 (Ethereum) | `AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9` | 3.1.0 | prod |
| Spark Lend (Ethereum) | `GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si` | 3.1.0 | prod |
| Seamless Protocol (Base) — **substitute, see below** | `2u4mWUV4xS19ef1MbnxZHWLLMwdPxtVifH46JbonXwXP` | 3.1.0 | prod |

All four are on the *same* Messari lending schema major version (3.1.0), so
one shared query genuinely works, unmodified, against all four — this is the
important thing, more than any individual protocol's brand name.

## Morpho Blue: could not confirm live — substituted with Seamless Protocol

The task explicitly named Morpho Blue as one of the four target protocols.
It could not be confirmed live on the decentralized network with a
Messari-schema subgraph, for two independent reasons:

1. **Messari's own `morpho-blue` entry in `deployment.json`** has
   `"status": "dev"` and its `services` object contains only a
   `hosted-service` entry — no `decentralized-network` entry at all. Messari
   never published a Morpho Blue subgraph to the decentralized network
   (the old "hosted service" was The Graph's deprecated free centralized
   service, fully shut down, not queryable via the gateway).
2. **The Morpho-maintained alternative**,
   [`morpho-org/morpho-blue-subgraph`](https://github.com/morpho-org/morpho-blue-subgraph)
   (which does implement the Messari lending schema), is explicitly marked
   deprecated in Morpho's own docs
   (<https://docs.morpho.org/subgraphs/deployment/>): *"The Morpho Subgraphs
   are deprecated. The repository has not been maintained since March 2025
   and the Morpho Association no longer provides official support."* Morpho
   now directs integrators to their own REST API instead of a subgraph. A
   subgraph ID for it (`8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs`, mainnet)
   does appear to exist and be curated on Graph Explorer, but building the
   demo's composability story on an unmaintained subgraph the maintainer
   itself has walked away from is a bad bet for a live judged demo.

**Substitute chosen: Seamless Protocol (Base)**, `2u4mWUV4xS19ef1...JbonXwXP`.
It is a real, separately-run, separately-branded lending protocol (not the
same company as Aave, Compound, or Spark), it is schema version 3.1.0 (same
as the other three), Messari's `deployment.json` lists it `"status": "prod"`
with a populated `decentralized-network` entry, and it was last indexed to a
recent block per Graph Explorer (~1.0K GRT signalled, actively queried). It
architecturally happens to be an Aave-v3 fork (like Spark also is), but it is
a distinct protocol/company/deployment — the same relationship Spark has to
Aave — so the "one query, N independently-operated protocols" story still
holds honestly.

`GRAPH_MORPHO_SUBGRAPH_ID` is kept (blank) in `agent/.env.example` and in
`watchtower.ts`'s protocol list — if a live, indexed, Messari-schema Morpho
subgraph ID surfaces later, set the env var and it is picked up with zero
code changes (fixture file `graph/fixtures/morpho-blue.json` is already
prepared for it).

## Real schema field names (verified, not guessed)

Fetched the actual schema directly:
<https://raw.githubusercontent.com/messari/subgraphs/master/schema-lending.graphql>
(matches schema version 3.1.0, as used by all four subgraphs above).

**Important correction vs. the approximation in `docs/architecture-notes.md` section 5.2:**
`Position` does **not** have a `balanceUSD` field. It only stores `balance`
in the token's native units:

```graphql
type Position @entity {
  id: ID!
  account: Account!
  market: Market!
  asset: Token!
  side: PositionSide!         # COLLATERAL | BORROWER — this part of docs/architecture-notes.md WAS correct
  balance: BigInt!            # native units, NOT USD
  ...
  snapshots: [PositionSnapshot!]! @derivedFrom(field: "position")
}
```

USD-denominated balance lives on `PositionSnapshot` (taken on every
deposit/withdraw/borrow/repay event for that position):

```graphql
type PositionSnapshot @entity(immutable: true) {
  position: Position!
  balance: BigInt!
  balanceUSD: BigDecimal!      # <- the USD value we actually want
  timestamp: BigInt!
  ...
}
```

And `Market.liquidationThreshold` is confirmed as a plain percentage value
(e.g. `80` means 80%, not `0.8` and not basis points):

```graphql
type Market @entity {
  id: Bytes!
  name: String
  liquidationThreshold: BigDecimal!   # e.g. "80" == 80%
  inputToken: Token!
  inputTokenBalance: BigInt!
  inputTokenPriceUSD: BigDecimal!
  ...
}
```

So the query this module actually uses (`graph/schema.ts`,
`MARKET_RISK_QUERY`) fetches `positions(where: { account_in, balance_gt:
"0" })` with `side`, `market { name liquidationThreshold }`, and
`snapshots(first: 1, orderBy: timestamp, orderDirection: desc) { balanceUSD
}` to get each position's most recent USD-denominated balance — one query
shape, unmodified across all four subgraph IDs.

## Verification caveats (be aware, re-check before the live demo)

- No `THE_GRAPH_API_KEY` exists yet, so none of the above was confirmed by
  actually executing `MARKET_RISK_QUERY` against the live gateway — that
  requires the real key. Once `THE_GRAPH_API_KEY` is filled into the root
  `.env`, re-verify with e.g.:
  ```bash
  curl -s -X POST \
    "https://gateway.thegraph.com/api/$THE_GRAPH_API_KEY/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk" \
    -H 'content-type: application/json' \
    -d '{"query":"{ positions(first: 3) { id side balanceUSD: snapshots(first:1){balanceUSD} } }"}'
  ```
  and switch `GRAPH_MODE=live` (see `agent/README.md`).
- `thegraph.com/explorer` is a client-rendered SPA; automated fetches of it
  return mostly empty page shells rather than the live indexing-status data,
  so explorer pages were used only for secondary corroboration, not as the
  primary source of truth — `deployment.json` was.
- `deployment/deployment.json` in `messari/subgraphs` was last modified
  2025-02-27. All four chosen protocols (Aave v3, Compound v3, Spark, and
  Seamless) are large, mature, still-operating protocols, so their
  subgraphs remaining indexed is a safe bet, but this should still be
  re-confirmed once real gateway access exists — same command as above.
