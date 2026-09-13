/**
 * The ONE shared GraphQL query shape used against every Messari-standardized
 * lending subgraph, regardless of protocol. Only the subgraph ID in the URL
 * changes between Aave v3, Compound v3, Spark, and Seamless - this string
 * never does. See SUBGRAPH_NOTES.md for how the field names below were
 * verified against the real schema (messari/subgraphs `schema-lending.graphql`,
 * schema version 3.1.0), which differs from the earlier approximation in
 * docs/architecture-notes.md in one important way:
 *
 *   Position does NOT carry a `balanceUSD` field directly (it only stores
 *   `balance` in native token units). USD balance lives on the position's
 *   PositionSnapshot entities, taken on every event. So this query pulls the
 *   single most recent snapshot per position to get `balanceUSD`.
 *
 * Real, confirmed field names used here: Position.side (COLLATERAL |
 * BORROWER), Position.market, Market.name, Market.liquidationThreshold
 * (percentage, e.g. 80 == 80%), PositionSnapshot.balanceUSD.
 */
export const MARKET_RISK_QUERY = /* GraphQL */ `
  query MarketRisk($accounts: [String!]!) {
    positions(
      first: 1000
      where: { account_in: $accounts, balance_gt: "0" }
    ) {
      id
      side
      account {
        id
      }
      market {
        name
        liquidationThreshold
      }
      snapshots(first: 1, orderBy: timestamp, orderDirection: desc) {
        balanceUSD
      }
    }
  }
`;

/** Shape of one entry in the raw `positions` array returned by MARKET_RISK_QUERY. */
export interface RawPosition {
  id: string;
  side: "COLLATERAL" | "BORROWER";
  account: { id: string };
  market: {
    name: string | null;
    liquidationThreshold: string; // BigDecimal, serialized as a string over GraphQL
  };
  snapshots: Array<{ balanceUSD: string }>; // BigDecimal, serialized as a string
}

/** The raw shape returned under `data` for MARKET_RISK_QUERY. */
export interface RawGraphResponse {
  positions: RawPosition[];
}
