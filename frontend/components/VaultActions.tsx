"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { watchmanVaultAbi } from "@/lib/abis";
import { VAULT_DEPLOYED, WATCHMAN_VAULT_ADDRESS } from "@/lib/config";
import type { VaultPolicy } from "@/lib/types";

const USDC_DECIMALS = 6;

function TxStatus({ hash, error }: { hash?: `0x${string}`; error: Error | null }) {
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });
  if (error) {
    return <p className="text-xs text-bad">{error.message.split("\n")[0]}</p>;
  }
  if (!hash) return null;
  if (isLoading) return <p className="text-xs text-ink-faint">Confirming transaction…</p>;
  if (isSuccess) return <p className="text-xs text-good">Confirmed on-chain.</p>;
  return null;
}

export function DepositWithdrawForm() {
  const { isConnected } = useAccount();
  const [amount, setAmount] = useState("100");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();

  const disabled = !VAULT_DEPLOYED || !isConnected || !amount || Number(amount) <= 0;

  function submit(fn: "deposit" | "withdraw") {
    if (!WATCHMAN_VAULT_ADDRESS) return;
    reset();
    writeContract({
      address: WATCHMAN_VAULT_ADDRESS,
      abi: watchmanVaultAbi,
      functionName: fn,
      args: [parseUnits(amount || "0", USDC_DECIMALS)],
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="tracked-label text-[10px] text-ink-faint">Amount (USDC)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-sm border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-accent"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || isPending}
          onClick={() => submit("deposit")}
          className="tracked-label flex-1 rounded-sm bg-accent px-3 py-2 text-xs font-bold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isPending ? "Confirm in Wallet…" : "Deposit"}
        </button>
        <button
          type="button"
          disabled={disabled || isPending}
          onClick={() => submit("withdraw")}
          className="tracked-label flex-1 rounded-sm border border-border-strong px-3 py-2 text-xs font-bold text-ink transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          {isPending ? "Confirm in Wallet…" : "Withdraw"}
        </button>
      </div>
      <TxStatus hash={hash} error={error} />
      {!VAULT_DEPLOYED && (
        <p className="font-serif text-xs text-ink-faint">
          WatchmanVault is not yet deployed — actions are disabled until{" "}
          <code className="font-mono">NEXT_PUBLIC_WATCHMAN_VAULT_ADDRESS</code> is set.
        </p>
      )}
      {VAULT_DEPLOYED && !isConnected && (
        <p className="font-serif text-xs text-ink-faint">Connect a wallet to deposit or withdraw.</p>
      )}
    </div>
  );
}

export function PolicyForm({ initialPolicy }: { initialPolicy: VaultPolicy }) {
  const { isConnected } = useAccount();
  const [maxSpendPerTx, setMaxSpendPerTx] = useState(String(initialPolicy.maxSpendPerTx));
  const [maxSpendPerDay, setMaxSpendPerDay] = useState(String(initialPolicy.maxSpendPerDay));
  const [minHealthFactorBps, setMinHealthFactorBps] = useState(
    String(initialPolicy.minHealthFactorBps),
  );
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();

  const disabled = !VAULT_DEPLOYED || !isConnected;

  function submit() {
    if (!WATCHMAN_VAULT_ADDRESS) return;
    reset();
    writeContract({
      address: WATCHMAN_VAULT_ADDRESS,
      abi: watchmanVaultAbi,
      functionName: "setPolicy",
      args: [
        parseUnits(maxSpendPerTx || "0", USDC_DECIMALS),
        parseUnits(maxSpendPerDay || "0", USDC_DECIMALS),
        BigInt(minHealthFactorBps || "0"),
      ],
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="tracked-label text-[10px] text-ink-faint">Max Spend / Tx (USDC)</span>
        <input
          type="number"
          min="0"
          value={maxSpendPerTx}
          onChange={(e) => setMaxSpendPerTx(e.target.value)}
          className="rounded-sm border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="tracked-label text-[10px] text-ink-faint">Max Spend / Day (USDC)</span>
        <input
          type="number"
          min="0"
          value={maxSpendPerDay}
          onChange={(e) => setMaxSpendPerDay(e.target.value)}
          className="rounded-sm border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="tracked-label text-[10px] text-ink-faint">
          Min Health Factor (bps, 10000 = 1.00)
        </span>
        <input
          type="number"
          min="0"
          value={minHealthFactorBps}
          onChange={(e) => setMinHealthFactorBps(e.target.value)}
          className="rounded-sm border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-accent"
        />
      </label>
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={submit}
        className="tracked-label rounded-sm border border-teal/60 bg-teal-soft/30 px-3 py-2 text-xs font-bold text-teal transition-colors hover:bg-teal-soft/50 disabled:opacity-40"
      >
        {isPending ? "Confirm in Wallet…" : "Update Policy"}
      </button>
      <TxStatus hash={hash} error={error} />
      {!VAULT_DEPLOYED && (
        <p className="font-serif text-xs text-ink-faint">
          Policy caps are the human-in-the-loop safety layer (PROJECT.md 5.1) — enabled once the
          vault contract is deployed.
        </p>
      )}
    </div>
  );
}
