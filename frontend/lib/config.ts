import { isAddress } from "viem";

// --- Agent API (PROJECT.md 5.4) --------------------------------------------
export const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL?.replace(/\/+$/, "") || "http://localhost:4000";

export const AGENT_WS_URL = AGENT_API_URL.replace(/^http/, "ws") + "/ws";

// --- Arc testnet chain ------------------------------------------------------
export const ARC_CHAIN_ID = Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID || 5042002);

// --- Contract addresses (all optional — undeployed is a valid, demoed state) -
function readAddress(raw: string | undefined): `0x${string}` | undefined {
  if (!raw) return undefined;
  return isAddress(raw) ? (raw as `0x${string}`) : undefined;
}

export const WATCHMAN_VAULT_ADDRESS = readAddress(process.env.NEXT_PUBLIC_WATCHMAN_VAULT_ADDRESS);
export const MOCK_LENDING_POOL_ADDRESS = readAddress(
  process.env.NEXT_PUBLIC_MOCK_LENDING_POOL_ADDRESS,
);
// Not part of the root .env.example (that file predates the frontend needing this
// address directly) — read defensively, same "unset is fine" contract as the others.
export const MOCK_PRICE_FEED_ADDRESS = readAddress(process.env.NEXT_PUBLIC_MOCK_PRICE_FEED_ADDRESS);

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const VAULT_DEPLOYED = Boolean(WATCHMAN_VAULT_ADDRESS);
export const PRICE_FEED_DEPLOYED = Boolean(MOCK_PRICE_FEED_ADDRESS);

// Demo/watchlist fallback address used when no wallet is connected yet, so the
// vault page always has *a* user to query instead of rendering nothing.
export const DEMO_USER_ADDRESS = "0x0000000000000000000000000000000000BADA55" as const;
