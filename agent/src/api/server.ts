import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { getWatchtower } from "../graph/watchtower.js";
import { getDemoVaultState } from "../chain/vault.js";
import { getRecentActivity, subscribeToActivity } from "./activity.js";
import { getApiPort, getWatchlist } from "../config.js";

/**
 * REST + WebSocket API consumed by `frontend/lib/api.ts` — see PROJECT.md
 * section 5.4 for the endpoint contract. Every endpoint fails soft (500 with
 * a JSON error body) rather than crashing the process, since the frontend's
 * own fetch layer already falls back to labeled example data on any
 * non-2xx/timeout response.
 */
export function startApiServer(): void {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/watchtower", async (_req, res) => {
    try {
      const risks = await getWatchtower(getWatchlist());
      res.json(risks);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/vault/:user", async (req, res) => {
    try {
      const user = req.params.user;
      if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
        res.status(400).json({ error: "invalid address" });
        return;
      }
      const state = await getDemoVaultState(user as `0x${string}`);
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/activity", (_req, res) => {
    res.json(getRecentActivity());
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (socket: WebSocket) => {
    // Send the current backlog immediately so a freshly-opened dashboard tab
    // isn't stuck showing nothing until the next agent decision happens.
    socket.send(JSON.stringify({ type: "snapshot", events: getRecentActivity() }));

    const unsubscribe = subscribeToActivity((event) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "event", event }));
      }
    });
    socket.on("close", unsubscribe);
  });

  const port = getApiPort();
  httpServer.listen(port, () => {
    console.log(`[watchman-agent] API listening on http://localhost:${port} (WS at /ws)`);
  });
}
