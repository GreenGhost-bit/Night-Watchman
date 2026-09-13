"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { arcTestnet } from "@/lib/chains";
import { truncateAddress } from "@/lib/format";

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const wrongNetwork = isConnected && chainId !== arcTestnet.id;

  if (!isConnected) {
    const connector = connectors[0];
    return (
      <button
        type="button"
        disabled={!connector || isPending}
        onClick={() => connector && connect({ connector })}
        className="tracked-label rounded-sm border border-accent/70 bg-accent-soft/20 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft/35 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : connector ? "Connect Wallet" : "No Wallet Found"}
      </button>
    );
  }

  if (wrongNetwork) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        disabled={isSwitching}
        className="tracked-label rounded-sm border border-bad/60 bg-bad-soft/30 px-3 py-1.5 text-xs font-semibold text-bad transition-colors hover:bg-bad-soft/50 disabled:opacity-50"
      >
        {isSwitching ? "Switching…" : "Wrong Network — Switch to Arc"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => disconnect()}
      title="Disconnect wallet"
      className="flex items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-xs transition-colors hover:border-border-strong"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-good" />
      <span className="font-mono text-ink">{truncateAddress(address ?? "")}</span>
    </button>
  );
}
