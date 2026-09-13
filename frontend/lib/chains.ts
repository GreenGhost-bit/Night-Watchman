import { arcTestnet as viemArcTestnet } from "viem/chains";

// viem@2.56.3 ships `arcTestnet` out of the box (id 5042002, RPC
// https://rpc.testnet.arc.network, ArcScan explorer) with the native currency
// metadata declared at 18 decimals — that's viem's own convention for chain
// definitions even though Arc's actual USDC ERC20 view is 6 decimals. Mirrored
// here verbatim rather than redefined, per PROJECT.md 5.5.
export const arcTestnet = viemArcTestnet;
