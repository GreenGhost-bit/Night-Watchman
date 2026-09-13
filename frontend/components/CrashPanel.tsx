"use client";

import { parseUnits } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { mockPriceFeedAbi } from "@/lib/abis";
import { MOCK_PRICE_FEED_ADDRESS, PRICE_FEED_DEPLOYED } from "@/lib/config";

export function CrashPanel({ currentPriceUsd }: { currentPriceUsd: number }) {
  const { address, isConnected } = useAccount();

  const { data: owner } = useReadContract({
    address: MOCK_PRICE_FEED_ADDRESS,
    abi: mockPriceFeedAbi,
    functionName: "owner",
    query: { enabled: PRICE_FEED_DEPLOYED },
  });

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const isOwner =
    PRICE_FEED_DEPLOYED && !!owner && !!address && owner.toLowerCase() === address.toLowerCase();

  const crashedPrice = Math.max(1, Math.round(currentPriceUsd * 0.42));

  function trigger() {
    if (!MOCK_PRICE_FEED_ADDRESS) return;
    reset();
    // MockPriceFeed prices are stored 8-decimal (Chainlink-style) fixed point.
    writeContract({
      address: MOCK_PRICE_FEED_ADDRESS,
      abi: mockPriceFeedAbi,
      functionName: "setPrice",
      args: [parseUnits(String(crashedPrice), 8)],
    });
  }

  return (
    <div className="rounded-md border border-bad/40 bg-bad-soft/15 p-4">
      <p className="tracked-label text-[10px] font-bold text-bad">Judge-Facing Demo Control</p>
      <h3 className="mt-1 font-sans text-xl font-semibold uppercase tracking-wide text-ink">
        Trigger Market Crash
      </h3>
      <p className="mt-1.5 font-serif text-xs text-ink-soft">
        Calls <code className="font-mono">MockPriceFeed.setPrice</code>, forcing the collateral
        price from {`$${currentPriceUsd.toLocaleString("en-US")}`} down to {`$${crashedPrice.toLocaleString("en-US")}`}{" "}
        — the live demo moment where the agent must detect and defend the position. This is a
        clearly-labeled demo fixture, not a real Chainlink price feed.
      </p>

      <button
        type="button"
        disabled={!PRICE_FEED_DEPLOYED || !isConnected || !isOwner || isPending || isConfirming}
        onClick={trigger}
        className="tracked-label mt-3 w-full rounded-sm bg-bad px-3 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {isPending || isConfirming ? "Crashing Market…" : "Crash the Market"}
      </button>

      {!PRICE_FEED_DEPLOYED && (
        <p className="mt-2 font-serif text-xs text-ink-faint">
          MockPriceFeed is not yet deployed — set{" "}
          <code className="font-mono">NEXT_PUBLIC_MOCK_PRICE_FEED_ADDRESS</code> after contracts
          ship.
        </p>
      )}
      {PRICE_FEED_DEPLOYED && !isConnected && (
        <p className="mt-2 font-serif text-xs text-ink-faint">Connect the owner wallet to arm this control.</p>
      )}
      {PRICE_FEED_DEPLOYED && isConnected && !isOwner && (
        <p className="mt-2 font-serif text-xs text-ink-faint">
          Connected wallet is not the MockPriceFeed owner — this control is enforced on-chain.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-bad">{error.message.split("\n")[0]}</p>}
      {isSuccess && <p className="mt-2 text-xs text-good">Market crashed. Watch the Activity Log.</p>}
    </div>
  );
}
