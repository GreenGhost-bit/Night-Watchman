# agent/ — Lamplighter, Graph module

TypeScript module proving the Graph composability story: **one GraphQL query
shape, one normalization function, one risk formula** — queried unmodified
against four independently-operated, Messari-standardized lending
protocols. See `src/graph/SUBGRAPH_NOTES.md` for exactly which subgraph IDs
were confirmed live and why Morpho Blue was substituted with Seamless
Protocol.

## Layout

```
src/
  graph/
    schema.ts      the one shared GraphQL query (MARKET_RISK_QUERY)
    client.ts       queryProtocolRisk() — live gateway fetch, or fixture read
    watchtower.ts   getWatchtower() — queries every configured protocol, normalizes, combines
    fixtures/       committed synthetic JSON fixtures, one per protocol
    SUBGRAPH_NOTES.md
  risk/
    score.ts        normalizePosition() — the single shared risk formula
  index.ts          minimal demo entrypoint (npm run dev)
test/
  score.test.ts       unit tests for the normalization formula
  watchtower.test.ts  fixture-mode end-to-end tests across all 4 protocols
```

## Setup

```bash
cd agent
npm install
cp .env.example .env   # already has real, public, confirmed subgraph IDs filled in
```

## Running in fixture mode (works right now, zero external accounts)

This is the default (`GRAPH_MODE=fixture`, or just leave it unset). Every
protocol's response is read from a committed JSON fixture under
`src/graph/fixtures/`, shaped **exactly** like a real gateway response to
`MARKET_RISK_QUERY` (same field names, same nesting), so switching to live
mode later is a one-line env var change with zero code changes.

```bash
npm run build   # tsc, zero errors
npm test        # vitest, all passing
npm run dev     # runs src/index.ts against the fixtures, prints normalized risk for every account
```

The fixtures include, per protocol, a mix of a healthy position, a
near-liquidation position (riskRatio just under 1), and an already-underwater
position (riskRatio > 1) — plus two dedicated edge cases in the Seamless
fixture: an account with collateral but zero debt (riskRatio == 0) and an
account with debt but zero collateral (riskRatio == Infinity).

All fixture data is clearly synthetic (`_note` field in each fixture file,
round-number USD balances, sequential placeholder addresses like
`0x1111...1111`) — it is not real on-chain data.

## Switching to live mode (once `THE_GRAPH_API_KEY` is filled in)

1. Get a free API key from <https://thegraph.com/studio/apikeys/> and put it
   in the **root** `.env` as `THE_GRAPH_API_KEY=...` (per the root
   `.env.example` — that's the single source of truth for this secret; this
   module's own `.env` only needs the subgraph IDs, which are already
   filled in and are not secrets).
2. In `agent/.env`, set `GRAPH_MODE=live`.
3. Run `npm run dev` (or call `getWatchtower()` from your own code) exactly
   as before — `client.ts` automatically queries
   `https://gateway.thegraph.com/api/{THE_GRAPH_API_KEY}/subgraphs/id/{id}`
   for each configured protocol instead of reading a fixture. No other code
   changes anywhere in this module.

To sanity-check the gateway/key directly first, see the `curl` example at
the bottom of `src/graph/SUBGRAPH_NOTES.md`.

## The core design constraint

`src/graph/schema.ts` contains exactly one GraphQL query string
(`MARKET_RISK_QUERY`), and `src/risk/score.ts` contains exactly one
normalization function (`normalizePosition`). Neither file branches on
protocol name. The only thing that varies per protocol is the subgraph ID
passed into `queryProtocolRisk()` — that sameness across four independently
operated, differently-branded protocols (Aave v3, Compound v3, Spark,
Seamless) *is* the submission for The Graph's "Composable / Standardized
Products" track. Do not add protocol-specific branches to this module —
if a new protocol's response doesn't fit the shared query/formula, that's a
signal the protocol isn't actually on the standardized schema, not a reason
to special-case it.
