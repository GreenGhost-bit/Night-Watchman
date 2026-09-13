import { AGENT_API_URL } from "./config";
import { MOCK_ACTIVITY, MOCK_VAULT_STATE, MOCK_WATCHTOWER } from "./mockData";
import type { ActivityEvent, PositionRisk, VaultState } from "./types";

export interface FetchResult<T> {
  data: T;
  live: boolean;
}

async function fetchJson<T>(path: string, timeoutMs = 4000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AGENT_API_URL}${path}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/watchtower — falls back to labeled example data if the agent API is unreachable. */
export async function getWatchtower(): Promise<FetchResult<PositionRisk[]>> {
  try {
    const data = await fetchJson<PositionRisk[]>("/api/watchtower");
    if (!Array.isArray(data) || data.length === 0) throw new Error("empty response");
    return { data, live: true };
  } catch {
    return { data: MOCK_WATCHTOWER, live: false };
  }
}

/** GET /api/vault/:user — falls back to labeled example data if the agent API is unreachable. */
export async function getVaultState(user: string): Promise<FetchResult<VaultState>> {
  try {
    const data = await fetchJson<VaultState>(`/api/vault/${user}`);
    return { data, live: true };
  } catch {
    return { data: { ...MOCK_VAULT_STATE, user }, live: false };
  }
}

/** GET /api/activity — falls back to labeled example data if the agent API is unreachable. */
export async function getActivity(): Promise<FetchResult<ActivityEvent[]>> {
  try {
    const data = await fetchJson<ActivityEvent[]>("/api/activity");
    if (!Array.isArray(data) || data.length === 0) throw new Error("empty response");
    return { data, live: true };
  } catch {
    return { data: MOCK_ACTIVITY, live: false };
  }
}
