/**
 * Deployed contract addresses, read from environment variables. Names match
 * exactly what `contracts/script/DeployArc.s.sol` and `DeploySepolia.s.sol`
 * print at the end of a deploy — copy those log lines straight into `.env`.
 *
 * Every field is optional at the type level because, per docs/architecture-notes.md section 6,
 * actually broadcasting a deployment to a live network is a manual step the
 * user runs themselves — this module must not crash at import time just
 * because deployment hasn't happened yet. Callers that need a specific
 * address should use `requireAddress`.
 */
export interface DeployedAddresses {
  watchmanVault?: `0x${string}`;
  mockLendingPool?: `0x${string}`;
  mockLendingPoolAdapter?: `0x${string}`;
  mockPriceFeed?: `0x${string}`;
  mockWeth?: `0x${string}`;
  usdc?: `0x${string}`;
}

function envAddress(name: string): `0x${string}` | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Environment variable ${name} is set but is not a valid address: "${value}"`);
  }
  return value as `0x${string}`;
}

export function loadAddresses(): DeployedAddresses {
  return {
    watchmanVault: envAddress("WATCHMAN_VAULT_ADDRESS"),
    mockLendingPool: envAddress("MOCK_LENDING_POOL_ADDRESS"),
    mockLendingPoolAdapter: envAddress("MOCK_LENDING_POOL_ADAPTER_ADDRESS"),
    mockPriceFeed: envAddress("MOCK_PRICE_FEED_ADDRESS"),
    mockWeth: envAddress("MOCK_WETH_ADDRESS"),
    usdc: envAddress("USDC_ADDRESS"),
  };
}

export function requireAddress(
  addresses: DeployedAddresses,
  key: keyof DeployedAddresses,
): `0x${string}` {
  const value = addresses[key];
  if (!value) {
    throw new Error(
      `Missing deployed address for "${key}". Run a deploy script (see contracts/README.md) ` +
        `and copy its printed address into .env, or set MOCK_MODE=1 to run against synthetic data.`,
    );
  }
  return value;
}
