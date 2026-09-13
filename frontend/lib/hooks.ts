"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getActivity, getVaultState, getWatchtower } from "./api";
import { AGENT_WS_URL } from "./config";
import { MOCK_ACTIVITY, MOCK_VAULT_STATE, MOCK_WATCHTOWER } from "./mockData";
import type { ActivityEvent } from "./types";

/**
 * True only after the first client-side render. Use it to gate any output
 * that depends on `Date.now()`/locale formatting (relative timestamps, clock
 * strings) — those necessarily differ between the server-rendered HTML and
 * the client's first paint and would otherwise trigger a hydration mismatch.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function useWatchtowerQuery() {
  return useQuery({
    queryKey: ["watchtower"],
    queryFn: getWatchtower,
    refetchInterval: 15_000,
    staleTime: 5_000,
    // Seed with labeled example data so the very first frame is already
    // populated instead of blank while the real fetch (or its timeout) runs.
    initialData: { data: MOCK_WATCHTOWER, live: false },
  });
}

export function useVaultQuery(user: string) {
  return useQuery({
    queryKey: ["vault", user],
    queryFn: () => getVaultState(user),
    refetchInterval: 10_000,
    staleTime: 4_000,
    initialData: { data: { ...MOCK_VAULT_STATE, user }, live: false },
  });
}

interface ActivityFeedState {
  events: ActivityEvent[];
  live: boolean;
  wsConnected: boolean;
  loading: boolean;
}

/**
 * Loads the recent activity log via GET /api/activity, then upgrades to a
 * live WS push (PROJECT.md 5.4: `WS /ws`). If either is unreachable we stay
 * on labeled example data instead of ever rendering an empty/broken feed.
 */
export function useActivityFeed(): ActivityFeedState {
  const [events, setEvents] = useState<ActivityEvent[]>(MOCK_ACTIVITY);
  const [live, setLive] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    getActivity().then((result) => {
      if (cancelled) return;
      setEvents(result.data);
      setLive(result.live);
      setLoading(false);
      seenIds.current = new Set(result.data.map((e) => e.id));
    });

    let ws: WebSocket | undefined;
    try {
      ws = new WebSocket(AGENT_WS_URL);
      ws.onopen = () => setWsConnected(true);
      ws.onerror = () => setWsConnected(false);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data) as ActivityEvent | ActivityEvent[];
          const incoming = Array.isArray(parsed) ? parsed : [parsed];
          setEvents((prev) => {
            const fresh = incoming.filter((e) => !seenIds.current.has(e.id));
            fresh.forEach((e) => seenIds.current.add(e.id));
            if (fresh.length === 0) return prev;
            return [...fresh, ...prev].slice(0, 200);
          });
          setLive(true);
        } catch {
          // ignore malformed frames
        }
      };
    } catch {
      setWsConnected(false);
    }

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, []);

  return { events, live, wsConnected, loading };
}
