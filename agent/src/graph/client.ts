import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MARKET_RISK_QUERY, type RawGraphResponse } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type GraphMode = "live" | "fixture";

function getGraphMode(): GraphMode {
  const mode = process.env.GRAPH_MODE?.toLowerCase();
  return mode === "live" ? "live" : "fixture";
}

/** Maps a subgraph ID to its committed fixture file (fixture mode only). */
const FIXTURE_FILE_BY_SUBGRAPH_ID: Record<string, string> = {
  // Populated by watchtower.ts via registerFixture() based on the
  // GRAPH_*_SUBGRAPH_ID env vars, so fixture mode works with the exact same
  // subgraph IDs that live mode would use.
};

/**
 * Registers which local fixture file to use for a given subgraph ID. Called
 * once per configured protocol by watchtower.ts. This keeps client.ts free
 * of any protocol-specific knowledge - it only ever sees "subgraph ID ->
 * fixture file" as an opaque mapping.
 */
export function registerFixture(subgraphId: string, fixtureFileName: string): void {
  FIXTURE_FILE_BY_SUBGRAPH_ID[subgraphId] = fixtureFileName;
}

/**
 * Queries a Messari-standardized lending subgraph for the given accounts'
 * open positions, using the single shared MARKET_RISK_QUERY. Parameterized
 * only by subgraph ID - there is no protocol-specific branching here.
 *
 * In `live` mode (GRAPH_MODE=live), queries The Graph's decentralized-network
 * gateway directly, authenticated with THE_GRAPH_API_KEY.
 *
 * In `fixture` mode (the default, and the only mode usable without a real
 * API key), reads a committed JSON fixture shaped exactly like the real
 * gateway response, so swapping to live mode later requires zero code
 * changes anywhere else in the agent.
 */
export async function queryProtocolRisk(
  subgraphId: string,
  accounts: string[],
): Promise<RawGraphResponse> {
  const mode = getGraphMode();
  if (mode === "fixture") {
    return queryFixture(subgraphId, accounts);
  }
  return queryLive(subgraphId, accounts);
}

async function queryLive(subgraphId: string, accounts: string[]): Promise<RawGraphResponse> {
  const apiKey = process.env.THE_GRAPH_API_KEY;
  if (!apiKey) {
    throw new Error(
      "THE_GRAPH_API_KEY is not set. Either set it to a real Subgraph Studio API key " +
        "(https://thegraph.com/studio/apikeys/) to run in live mode, or set GRAPH_MODE=fixture " +
        "to run against the committed synthetic fixtures instead.",
    );
  }

  const url = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: MARKET_RISK_QUERY,
      variables: { accounts: accounts.map((a) => a.toLowerCase()) },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `The Graph gateway request failed for subgraph ${subgraphId}: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as { data?: RawGraphResponse; errors?: unknown[] };
  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `The Graph gateway returned errors for subgraph ${subgraphId}: ${JSON.stringify(body.errors)}`,
    );
  }
  if (!body.data) {
    throw new Error(`The Graph gateway returned no data for subgraph ${subgraphId}`);
  }
  return body.data;
}

async function queryFixture(subgraphId: string, accounts: string[]): Promise<RawGraphResponse> {
  const fixtureFileName = FIXTURE_FILE_BY_SUBGRAPH_ID[subgraphId];
  if (!fixtureFileName) {
    throw new Error(
      `No fixture registered for subgraph ID "${subgraphId}". ` +
        `Call registerFixture(subgraphId, fileName) first, or check your GRAPH_*_SUBGRAPH_ID env vars ` +
        `match what watchtower.ts expects.`,
    );
  }

  const fixturePath = path.join(__dirname, "fixtures", fixtureFileName);
  const raw = await readFile(fixturePath, "utf-8");
  const parsed = JSON.parse(raw) as { data: RawGraphResponse };

  const wantedAccounts = new Set(accounts.map((a) => a.toLowerCase()));
  const filteredPositions = parsed.data.positions.filter((p) =>
    wantedAccounts.has(p.account.id.toLowerCase()),
  );

  return { positions: filteredPositions };
}
