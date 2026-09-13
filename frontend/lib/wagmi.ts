import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arcTestnet } from "./chains";
import { WALLETCONNECT_PROJECT_ID } from "./config";

// WalletConnect needs a real project id to open a session; without one we still
// want the app to render and let injected wallets (MetaMask etc.) work, per
// PROJECT.md 5.5 ("must render/function for local review" with a placeholder).
const connectors = [
  injected(),
  ...(WALLETCONNECT_PROJECT_ID
    ? [walletConnect({ projectId: WALLETCONNECT_PROJECT_ID, showQrModal: true })]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
