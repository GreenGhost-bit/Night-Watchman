import { getAddress } from "viem";
import { mockLendingPoolAbi, mockPriceFeedAbi, watchmanVaultAbi } from "./abi.js";
import { getClients } from "./clients.js";
import { loadAddresses, requireAddress } from "./addresses.js";

export interface DemoVaultState {
  user: `0x${string}`;
  vaultAddress: `0x${string}` | null;
  balanceUSDC: number; // human units (6 decimals)
  collateralWeth: number; // human units (18 decimals)
  debtUSDC: number; // human units (6 decimals)
  healthFactor: number; // human units (1.0 == 1e18 on-chain)
  policy: { maxSpendPerTx: number; maxSpendPerDay: number; minHealthFactorBps: number };
  agentAuthorized: boolean;
  priceFeedUsd: number; // human units (1e18 on-chain)
}

const USDC_DECIMALS = 1_000_000; // 1e6
const WETH_DECIMALS = 1_000_000_000_000_000_000; // 1e18
const HF_DECIMALS = 1_000_000_000_000_000_000; // 1e18

/** Reads the full demo vault + pool state for `user`, matching frontend's VaultState shape. */
export async function getDemoVaultState(userInput: `0x${string}`): Promise<DemoVaultState> {
  // Normalize to a proper EIP-55 checksum regardless of the input's casing — viem's
  // readContract otherwise throws on a syntactically-valid but incorrectly-checksummed
  // address (e.g. a hand-typed placeholder like "0x000...BADA55"), which would 500 this
  // endpoint for any address nobody has bothered to checksum, defeating the point of
  // returning a real (if all-zero) on-chain state for addresses with no activity yet.
  const user = getAddress(userInput);
  const addresses = loadAddresses();
  const { publicClient, account } = getClients();

  if (!addresses.watchmanVault || !addresses.mockLendingPool) {
    // No deployment yet — return an honestly-zeroed state rather than throwing, so
    // the API stays up (the frontend already handles this with its own fallback too).
    return {
      user,
      vaultAddress: null,
      balanceUSDC: 0,
      collateralWeth: 0,
      debtUSDC: 0,
      healthFactor: 0,
      policy: { maxSpendPerTx: 0, maxSpendPerDay: 0, minHealthFactorBps: 0 },
      agentAuthorized: false,
      priceFeedUsd: 0,
    };
  }

  const vault = addresses.watchmanVault;
  const pool = addresses.mockLendingPool;

  const [balance, policy, authorized, position, healthFactorRaw] = await Promise.all([
    publicClient.readContract({ address: vault, abi: watchmanVaultAbi, functionName: "balances", args: [user] }),
    publicClient.readContract({ address: vault, abi: watchmanVaultAbi, functionName: "policies", args: [user] }),
    publicClient.readContract({
      address: vault,
      abi: watchmanVaultAbi,
      functionName: "isAuthorizedAgent",
      args: [user, account.address],
    }),
    publicClient.readContract({ address: pool, abi: mockLendingPoolAbi, functionName: "positions", args: [user] }),
    publicClient.readContract({ address: pool, abi: mockLendingPoolAbi, functionName: "healthFactor", args: [user] }),
  ]);

  let priceFeedUsd = 0;
  if (addresses.mockPriceFeed) {
    const price = await publicClient.readContract({
      address: addresses.mockPriceFeed,
      abi: mockPriceFeedAbi,
      functionName: "getPrice",
    });
    priceFeedUsd = Number(price) / HF_DECIMALS;
  }

  // healthFactor() returns type(uint256).max for zero-debt positions. Cap it at a large
  // finite sentinel (999) rather than Infinity: JSON.stringify (used by Express's res.json)
  // silently turns Infinity into `null`, which would make the frontend's health-factor
  // gauge and defense math have to special-case a null instead of just a very healthy number.
  const rawHf = healthFactorRaw as bigint;
  const MAX_DISPLAYED_HEALTH_FACTOR = 999;
  const healthFactor =
    rawHf > 1_000_000_000_000_000_000_000n
      ? MAX_DISPLAYED_HEALTH_FACTOR
      : Number(rawHf) / HF_DECIMALS;

  return {
    user,
    vaultAddress: vault,
    balanceUSDC: Number(balance) / USDC_DECIMALS,
    collateralWeth: Number(position[0]) / WETH_DECIMALS,
    debtUSDC: Number(position[1]) / USDC_DECIMALS,
    healthFactor,
    policy: {
      maxSpendPerTx: Number(policy[0]) / USDC_DECIMALS,
      maxSpendPerDay: Number(policy[1]) / USDC_DECIMALS,
      minHealthFactorBps: Number(policy[2]),
    },
    agentAuthorized: authorized as boolean,
    priceFeedUsd,
  };
}

/**
 * Submits the on-chain defense transaction via `WatchmanVault.executeDefense`,
 * routed through the deployed `MockLendingPoolAdapter` into `MockLendingPool`.
 * Returns the transaction hash once mined.
 */
export async function submitDefense(
  userInput: `0x${string}`,
  amountUsdcHuman: number,
  reason: string,
): Promise<`0x${string}`> {
  const user = getAddress(userInput);
  const addresses = loadAddresses();
  const vault = requireAddress(addresses, "watchmanVault");
  const adapter = requireAddress(addresses, "mockLendingPoolAdapter");
  const pool = requireAddress(addresses, "mockLendingPool");

  const { publicClient, walletClient } = getClients();
  const amount = BigInt(Math.round(amountUsdcHuman * USDC_DECIMALS));

  const hash = await walletClient.writeContract({
    address: vault,
    abi: watchmanVaultAbi,
    functionName: "executeDefense",
    args: [user, adapter, pool, amount, reason],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
