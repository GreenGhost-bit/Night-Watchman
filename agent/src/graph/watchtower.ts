import { queryProtocolRisk, registerFixture } from "./client.js";
import type { RawPosition } from "./schema.js";
import { normalizePosition, type PositionRisk, type RawAccountPositions } from "../risk/score.js";

interface ProtocolConfig {
  /** Protocol label used on the normalized PositionRisk output. */
  protocol: string;
  /** Env var (matching the root .env.example naming) holding the subgraph ID. */
  envVar: string;
  /** Fixture file under graph/fixtures/, used when GRAPH_MODE=fixture. */
  fixtureFile: string;
}

/**
 * Every protocol this agent watches, all queried with the exact same
 * MARKET_RISK_QUERY shape from graph/schema.ts - only the subgraph ID
 * changes. See SUBGRAPH_NOTES.md for how each ID was confirmed and why
 * Morpho Blue (unavailable live on the decentralized network at research
 * time) was substituted with Seamless Protocol.
 */
const PROTOCOLS: ProtocolConfig[] = [
  { protocol: "aave-v3", envVar: "GRAPH_AAVE_V3_SUBGRAPH_ID", fixtureFile: "aave-v3.json" },
  {
    protocol: "compound-v3",
    envVar: "GRAPH_COMPOUND_V3_SUBGRAPH_ID",
    fixtureFile: "compound-v3.json",
  },
  { protocol: "spark", envVar: "GRAPH_SPARK_SUBGRAPH_ID", fixtureFile: "spark.json" },
  {
    protocol: "seamless",
    envVar: "GRAPH_SEAMLESS_SUBGRAPH_ID",
    fixtureFile: "seamless.json",
  },
  // Kept for completeness: if a live, indexed Morpho Blue Messari-schema
  // subgraph ID is confirmed later, set GRAPH_MORPHO_SUBGRAPH_ID and it will
  // be picked up automatically with zero code changes.
  { protocol: "morpho-blue", envVar: "GRAPH_MORPHO_SUBGRAPH_ID", fixtureFile: "morpho-blue.json" },
];

/** Groups the flat `positions` array from one subgraph response by account. */
function groupByAccount(positions: RawPosition[]): RawAccountPositions[] {
  const byAccount = new Map<string, RawAccountPositions>();
  for (const p of positions) {
    const accountId = p.account.id.toLowerCase();
    let entry = byAccount.get(accountId);
    if (!entry) {
      entry = { account: accountId, positions: [] };
      byAccount.set(accountId, entry);
    }
    const latestSnapshot = p.snapshots[0];
    entry.positions.push({
      side: p.side,
      balanceUSD: latestSnapshot ? Number(latestSnapshot.balanceUSD) : 0,
      liquidationThreshold: Number(p.market.liquidationThreshold),
      marketName: p.market.name ?? "unknown market",
    });
  }
  return [...byAccount.values()];
}

/** Per-protocol outcome of one watchtower sweep, so callers can show which
 *  feeds are live and which are degraded instead of silently under-reporting. */
export interface WatchtowerSource {
  protocol: string;
  ok: boolean;
  /** Number of normalized positions returned by this protocol (0 when !ok). */
  positionCount: number;
  /** Present only when ok === false. */
  error?: string;
}

export interface WatchtowerResult {
  positions: PositionRisk[];
  sources: WatchtowerSource[];
}

/**
 * Queries every configured Messari-standardized lending subgraph for the
 * given watchlist of accounts, and returns the combined, normalized
 * PositionRisk list plus per-protocol status.
 *
 * Protocols with no subgraph ID configured (empty env var) are skipped
 * entirely. Protocols that ARE configured but fail at query time — a
 * subgraph whose indexers are down, a gateway error, a malformed response —
 * are isolated: they are reported as `ok: false` while every healthy
 * protocol still returns its data.
 *
 * This isolation is deliberate and load-bearing. The Graph's decentralized
 * network routes each query to independent indexers, so any single subgraph
 * can go bad without warning (Seamless's indexers began returning 400 on
 * every query, including bare `_meta`, during this project's build). With a
 * plain Promise.all one such failure rejected the whole sweep and blanked
 * the entire Watchtower — the exact view the composability story rests on.
 * Partial, clearly-labeled data beats an empty dashboard.
 */
export async function getWatchtowerWithStatus(accounts: string[]): Promise<WatchtowerResult> {
  const configured = PROTOCOLS.map((cfg) => ({
    ...cfg,
    subgraphId: process.env[cfg.envVar]?.trim() ?? "",
  })).filter((cfg) => cfg.subgraphId.length > 0);

  const settled = await Promise.allSettled(
    configured.map(async (cfg) => {
      registerFixture(cfg.subgraphId, cfg.fixtureFile);
      const raw = await queryProtocolRisk(cfg.subgraphId, accounts);
      const grouped = groupByAccount(raw.positions);
      return grouped.map((accountPositions) => normalizePosition(accountPositions, cfg.protocol));
    }),
  );

  const positions: PositionRisk[] = [];
  const sources: WatchtowerSource[] = [];

  settled.forEach((outcome, i) => {
    const { protocol } = configured[i];
    if (outcome.status === "fulfilled") {
      positions.push(...outcome.value);
      sources.push({ protocol, ok: true, positionCount: outcome.value.length });
    } else {
      const error =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      sources.push({ protocol, ok: false, positionCount: 0, error });
      console.warn(`[watchtower] source "${protocol}" unavailable: ${error}`);
    }
  });

  return { positions, sources };
}

/**
 * Convenience wrapper returning just the combined PositionRisk list. Prefer
 * `getWatchtowerWithStatus` where the caller can surface feed health.
 */
export async function getWatchtower(accounts: string[]): Promise<PositionRisk[]> {
  const { positions } = await getWatchtowerWithStatus(accounts);
  return positions;
}
