#!/usr/bin/env bash
#
# Crashes the Arc demo price feed on camera. Run this while the agent is
# polling; within one poll cycle (15s) it detects the breach, the confidential
# workflow authorizes, and WatchmanVault.executeDefense fires on-chain.
#
# Usage:   ./scripts/crash-arc-demo.sh [price_usd]     (default 2600)
#
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

CAST=./tools/foundry/cast
RPC="${ARC_TESTNET_RPC_URL:?}"
KEY="${ARC_DEPLOYER_PRIVATE_KEY:?}"
FEED=0xC791288176d216EA5ca12bebE63B8c70Ea3705ef
POOL=0xe8c3D77fa5372552138424119CB1b61C898b00D3
USER_ADDR=0x867b93045Ad26db454bEc0ecb52759Bb0126Ac50

PRICE_USD="${1:-2600}"
PRICE_WEI="${PRICE_USD}000000000000000000"

echo "Crashing ETH to \$${PRICE_USD}..."
$CAST send "$FEED" 'setPrice(uint256)' "$PRICE_WEI" \
  --private-key "$KEY" --rpc-url "$RPC" >/dev/null

HF=$($CAST call "$POOL" 'healthFactor(address)(uint256)' "$USER_ADDR" --rpc-url "$RPC" | awk '{print $1}')
echo "Health factor now: $HF"
echo "Policy floor is 1.10 (11000 bps) — watch the Activity feed."
