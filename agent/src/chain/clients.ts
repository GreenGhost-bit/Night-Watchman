import { arcTestnet } from "viem/chains";
import { createPublicClient, createWalletClient, defineChain, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** Bare local anvil, for integration testing without touching any real network. */
export const localAnvil: Chain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export type NetworkName = "local" | "arc" | "sepolia";

function resolveChain(network: NetworkName): { chain: Chain; rpcUrl: string } {
  switch (network) {
    case "local":
      return { chain: localAnvil, rpcUrl: "http://127.0.0.1:8545" };
    case "arc":
      return {
        chain: arcTestnet,
        rpcUrl: process.env.ARC_TESTNET_RPC_URL?.trim() || arcTestnet.rpcUrls.default.http[0],
      };
    case "sepolia": {
      const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
      if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required for network=sepolia");
      return {
        chain: defineChain({
          id: 11155111,
          name: "Sepolia",
          nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [rpcUrl] } },
        }),
        rpcUrl,
      };
    }
  }
}

/**
 * Which network this agent instance talks to. Defaults to `local` (anvil) so
 * running the agent never accidentally reaches a real network without an
 * explicit opt-in via the AGENT_NETWORK env var.
 */
export function getNetwork(): NetworkName {
  const raw = process.env.AGENT_NETWORK?.trim().toLowerCase();
  if (raw === "arc" || raw === "sepolia" || raw === "local") return raw;
  return "local";
}

// Anvil's well-known default account #1 (distinct from account #0, which acts as the
// deployer/demo-user throughout this project) — safe, public, zero real value. Keeping the
// agent's own address different from the demo user's is deliberate: it's what makes
// WatchmanVault's per-user `authorizeAgent` boundary meaningful even in local dev, instead of
// a single key silently authorizing itself.
const LOCAL_ANVIL_DEFAULT_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

export function getClients(network: NetworkName = getNetwork()) {
  const { chain, rpcUrl } = resolveChain(network);
  const privateKey = (process.env.AGENT_PRIVATE_KEY?.trim() || LOCAL_ANVIL_DEFAULT_KEY) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ chain, transport: http(rpcUrl), account });

  return { chain, publicClient, walletClient, account };
}
