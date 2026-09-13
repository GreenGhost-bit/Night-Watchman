/** Union of every synthetic account across the committed Graph fixtures (see
 *  graph/fixtures/*.json) — gives the Watchtower real, varied cross-protocol
 *  output with zero setup in fixture mode. Override with a comma-separated
 *  `WATCHLIST` env var of real addresses once THE_GRAPH_API_KEY is live. */
const DEFAULT_WATCHLIST = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
  "0x6666666666666666666666666666666666666666",
  "0x7777777777777777777777777777777777777777",
  "0x8888888888888888888888888888888888888888",
  "0x9999999999999999999999999999999999999999",
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "0xcccccccccccccccccccccccccccccccccccccccc",
];

export function getWatchlist(): string[] {
  const raw = process.env.WATCHLIST?.trim();
  if (!raw) return DEFAULT_WATCHLIST;
  return raw.split(",").map((a) => a.trim()).filter(Boolean);
}

/** The demo user address whose real on-chain Arc/anvil position the agent actively defends
 *  (see PROJECT.md section 2) — distinct from the read-only Watchtower addresses above. */
export function getDemoUser(): `0x${string}` {
  const raw = process.env.DEMO_USER_ADDRESS?.trim();
  if (raw && /^0x[0-9a-fA-F]{40}$/.test(raw)) return raw as `0x${string}`;
  // Anvil's well-known default account #0 — safe, public, zero real value.
  return "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase() as `0x${string}`;
}

export function getPollIntervalMs(): number {
  const raw = Number(process.env.AGENT_POLL_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 15_000;
}

export function getApiPort(): number {
  const raw = Number(process.env.AGENT_API_PORT);
  return Number.isFinite(raw) && raw > 0 ? raw : 4000;
}
