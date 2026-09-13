"use client";

import { useAccount } from "wagmi";
import { CrashPanel } from "@/components/CrashPanel";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { HealthGauge } from "@/components/HealthGauge";
import { StatTile } from "@/components/StatTile";
import { DepositWithdrawForm, PolicyForm } from "@/components/VaultActions";
import { DEMO_USER_ADDRESS, VAULT_DEPLOYED } from "@/lib/config";
import { formatUsd, truncateAddress } from "@/lib/format";
import { useVaultQuery } from "@/lib/hooks";

export function VaultView() {
  const { address } = useAccount();
  const user = address ?? DEMO_USER_ADDRESS;
  const { data } = useVaultQuery(user);
  const vault = data?.data;
  const live = data?.live ?? false;

  if (!vault) return null;

  const minHealthFactor = vault.policy.minHealthFactorBps / 10_000;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-sans text-3xl font-semibold uppercase tracking-wide text-ink">
            Demo Vault
          </h1>
          <DataSourceBadge live={live} sourceLabel="agent/src/api" />
        </div>
        <p className="max-w-3xl font-serif text-sm text-ink-soft">
          A self-controlled ETH-collateral / USDC-debt position on Arc testnet — the only position
          this project touches directly. Defended live by the same risk-scoring path as the
          Watchtower.
        </p>
        <p className="font-mono text-[11px] text-ink-faint">Watched account {truncateAddress(user)}</p>
      </div>

      {!VAULT_DEPLOYED && (
        <div className="stamp text-sm font-bold text-accent">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 2 3 6v6c0 5.25 3.75 9.74 9 11 5.25-1.26 9-5.75 9-11V6l-9-4Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
          Not Yet Deployed — Showing Demo State
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-md border border-border bg-surface p-4">
          <HealthGauge healthFactor={vault.healthFactor} minHealthFactor={minHealthFactor} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Vault Balance" value={formatUsd(vault.balanceUSDC)} />
          <StatTile label="Collateral (WETH)" value={vault.collateralWeth.toFixed(3)} accent="teal" />
          <StatTile label="Debt" value={formatUsd(vault.debtUSDC)} />
          <StatTile label="Collateral Price" value={`$${vault.priceFeedUsd.toLocaleString("en-US")}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-surface p-4">
          <h2 className="font-sans text-lg font-semibold uppercase tracking-wide text-ink">
            Deposit / Withdraw
          </h2>
          <div className="mt-3">
            <DepositWithdrawForm />
          </div>
        </div>

        <div className="rounded-md border border-border bg-surface p-4">
          <h2 className="font-sans text-lg font-semibold uppercase tracking-wide text-ink">
            Policy — Human-in-the-Loop Caps
          </h2>
          <div className="mt-3">
            <PolicyForm initialPolicy={vault.policy} />
          </div>
        </div>

        <CrashPanel currentPriceUsd={vault.priceFeedUsd} />
      </div>
    </div>
  );
}
