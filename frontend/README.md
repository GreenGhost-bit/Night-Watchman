# The Night Watchman — Frontend

Next.js (App Router) operator console for the Watchtower / Demo Vault / Activity Log views
described in `PROJECT.md` section 5.5. Noir/dossier "case file" visual language: cool
ink/graphite neutrals, amber as both the brand accent and the risk/warning color, teal for
Graph-sourced data, and plain green/red reserved for unambiguous healthy/liquidatable states.

This directory is self-contained and does not depend on any other workstream being finished —
every view is resilient to its backend being absent (see "Resilience" below).

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000 (or next available port)
npm run build    # production build — must be clean
```

Copy `.env.local.example` to `.env.local` to override any of the variables below; every one of
them is optional and has a documented fallback.

## Pages

| Route | View |
|---|---|
| `/` (and `/watchtower`, which redirects to `/`) | **Watchtower** — grid of live positions across Aave v3, Compound v3, Morpho Blue, Spark, sorted critical-first, colored by `riskRatio` (green < 0.7, amber 0.7–0.9, red ≥ 0.9). |
| `/vault` | **Demo Vault** — health-factor gauge, collateral/debt, deposit/withdraw + policy forms wired to `WatchmanVault` via wagmi, and the judge-facing "Trigger Market Crash" button (`MockPriceFeed.setPrice`). |
| `/activity` | **Activity Log** — live feed of agent decisions from `GET /api/activity` + `WS /ws`, each entry linking to ArcScan when it carries a `txHash`. |

## Environment variables

All variables are read client-side (`NEXT_PUBLIC_*`) since this is a static operator console with
no server-side secrets. **Every one of them is optional** — the app is designed to render a
complete, populated first frame with or without them.

| Variable | Default if unset | What happens when unset |
|---|---|---|
| `NEXT_PUBLIC_AGENT_API_URL` | `http://localhost:4000` | If the agent API at this URL (or its default) is unreachable, `GET /api/watchtower`, `GET /api/vault/:user` and `GET /api/activity` all silently fall back to realistic example data, and every page shows a small "Example Data" stamp instead of the "Live" badge. The `WS /ws` connection (derived from this URL) simply never opens; the Activity Log stays on its example feed instead of erroring. |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | `5042002` | Used to detect "wrong network" in the wallet button and gauge zones; the app doesn't otherwise change behavior. |
| `NEXT_PUBLIC_WATCHMAN_VAULT_ADDRESS` | unset | The Demo Vault page renders a clearly-labeled **"Not Yet Deployed — Showing Demo State"** stamp, all vault state comes from the agent API/mock data as usual, and the deposit/withdraw/policy forms are disabled with an inline explanation instead of being hidden or broken. |
| `NEXT_PUBLIC_MOCK_LENDING_POOL_ADDRESS` | unset | Not read directly by any UI action today (the agent API is the source of truth for vault state); reserved for when contracts ship, matching the root `.env.example`. |
| `NEXT_PUBLIC_MOCK_PRICE_FEED_ADDRESS` | unset | **Not present in the root `.env.example`** — added here because the frontend needs it directly to call `MockPriceFeed.setPrice` for the "Trigger Market Crash" button. When unset, that button is disabled with an inline "not yet deployed" note. When set, the button additionally checks on-chain `owner()` against the connected wallet and stays disabled (with an explanation) for non-owners — the contract enforces this regardless, this is just an honest UI state. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | unset | WalletConnect is simply omitted from the wallet connector list; injected wallets (MetaMask, etc.) still work fully. Per PROJECT.md 5.5, the app must render/function with zero required external accounts. |

An invalid (non-hex-address) value for any contract address variable is treated the same as
unset — it's validated with `viem`'s `isAddress` before use, never passed to wagmi unchecked.

## Resilience contract

Every data-fetching hook (`lib/api.ts`, `lib/hooks.ts`) follows the same pattern:

1. Try the real agent API with a 4s timeout.
2. On any failure (network error, timeout, non-2xx, empty array), fall back to hand-written,
   realistic example data in `lib/mockData.ts`.
3. React Query is seeded with that example data as `initialData`, so the very first paint —
   before any fetch has even resolved — is already fully populated. No view ever renders blank,
   a perpetual spinner, or a broken state.
4. A small badge (`DataSourceBadge`) always tells you which mode you're in: a pulsing teal "Live"
   pill, or an amber "Example Data" case-file stamp.

## Chain config

`lib/chains.ts` re-exports `arcTestnet` from `viem/chains` verbatim (confirmed present in the
pinned `viem@2.56.3`) rather than redefining it — chain id `5042002`, RPC
`https://rpc.testnet.arc.network`, ArcScan explorer. Note viem's own definition declares the
native currency at 18 decimals as a chain-definition convention, even though Arc's actual USDC
ERC20 view is 6 decimals; contract calls that move USDC use `parseUnits(amount, 6)` explicitly.

## Design tokens

All colors are CSS custom properties defined once in `app/globals.css` (`:root`, redefined under
`prefers-color-scheme: dark` and `[data-theme="dark"]`/`[data-theme="light"]`), then re-exposed to
Tailwind v4 via `@theme inline` so utility classes like `bg-surface` or `text-accent` re-read the
variable at paint time — this is what makes the OS theme toggle and the in-app manual toggle
(`next-themes`, top-right of the nav) both work correctly. Fonts (Barlow Condensed, Source Serif
4, IBM Plex Mono) are loaded via `next/font/google` in `app/layout.tsx`; all numeric figures use
the `font-mono` utility, which also sets `font-variant-numeric: tabular-nums`.

## Known deviations from the spec

- `NEXT_PUBLIC_MOCK_PRICE_FEED_ADDRESS` is a frontend-only env var not present in the repo root's
  `.env.example`, added because the "Trigger Market Crash" button needs a contract address the
  root file doesn't currently name. Flagged here so it can be added there once contracts deploy.
- Wallet connection uses wagmi's built-in `injected` + `walletConnect` connectors directly rather
  than a full wallet-UI library (RainbowKit/ConnectKit) to keep the dependency surface small for
  a hackathon timeline; this is a minimal but fully functional connect/disconnect/switch-network
  flow.
