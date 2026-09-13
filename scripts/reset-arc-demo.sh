#!/usr/bin/env bash
#
# Resets the live Arc testnet demo to its healthy starting state, so the
# crash -> detect -> defend sequence can be run (and re-run) on camera.
#
# After a defense fires, the position is left at HF ~1.39 with the price feed
# still crashed and the vault reserve partly spent. This puts it back to:
#
#     price  $3,000      debt  $10.00      vault  $5.00      HF  1.20
#
# Safe to run repeatedly. Reads addresses and keys from the repo-root .env.
#
# Usage:   ./scripts/reset-arc-demo.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env; set +a

CAST=./tools/foundry/cast
RPC="${ARC_TESTNET_RPC_URL:?set ARC_TESTNET_RPC_URL in .env}"
KEY="${ARC_DEPLOYER_PRIVATE_KEY:?set ARC_DEPLOYER_PRIVATE_KEY in .env}"

USER_ADDR=0x867b93045Ad26db454bEc0ecb52759Bb0126Ac50
AGENT_ADDR=0xc87401C48E6cE9dBD60dDA9151631e8AC920F5b4
USDC=0x3600000000000000000000000000000000000000
POOL=0xe8c3D77fa5372552138424119CB1b61C898b00D3
VAULT=0x622662b7e046eb40da12BCeDB890CA90238E87D0
FEED=0xC791288176d216EA5ca12bebE63B8c70Ea3705ef

TARGET_DEBT=10000000   # $10.00, 6dp
TARGET_VAULT=5000000   # $5.00, 6dp
START_PRICE=3000000000000000000000  # $3,000, 18dp

send() { # send <label> <to> <sig> [args...]
  local label="$1"; shift
  printf '  %-36s ' "$label"
  local out
  out=$($CAST send "$@" --private-key "$KEY" --rpc-url "$RPC" 2>&1) || { echo "FAILED"; echo "$out" | tail -4; exit 1; }
  echo "$out" | grep -qE '^status +1' && echo "ok" || { echo "FAILED"; echo "$out" | tail -4; exit 1; }
}

num() { $CAST call "$@" --rpc-url "$RPC" | awk '{print $1}'; }

echo "Resetting Arc demo..."

# 1. Un-crash the price feed.
send "price feed -> \$3,000" "$FEED" 'setPrice(uint256)' "$START_PRICE"

# 2. Restore debt to $10 so HF lands back on exactly 1.20.
DEBT=$($CAST call "$POOL" 'positions(address)(uint256,uint256)' "$USER_ADDR" --rpc-url "$RPC" | sed -n '2p' | awk '{print $1}')
if [ "$DEBT" -lt "$TARGET_DEBT" ]; then
  send "borrow back to \$10 debt" "$POOL" 'borrow(uint256)' "$((TARGET_DEBT - DEBT))"
else
  printf '  %-36s already at target\n' "debt"
fi

# 3. Top the vault reserve back up to $5.
BAL=$(num "$VAULT" 'balances(address)(uint256)' "$USER_ADDR")
if [ "$BAL" -lt "$TARGET_VAULT" ]; then
  TOPUP=$((TARGET_VAULT - BAL))
  send "approve vault for top-up"    "$USDC"  'approve(address,uint256)' "$VAULT" "$TOPUP"
  send "deposit reserve back to \$5" "$VAULT" 'deposit(uint256)' "$TOPUP"
else
  printf '  %-36s already at target\n' "vault reserve"
fi

# 4. Re-assert the policy. The per-day cap is set well above one defense so
#    repeated rehearsal takes aren't blocked by the rolling 24h window; the
#    per-tx cap stays at $2.50, which is the one the demo actually shows.
send "re-assert policy (per-tx \$2.50)" "$VAULT" \
  'setPolicy(uint256,uint256,uint256)' 2500000 25000000 11000

# 5. Make sure the agent can still pay for gas.
AGENT_GAS=$($CAST balance "$AGENT_ADDR" --rpc-url "$RPC")
if [ "${#AGENT_GAS}" -lt 18 ]; then
  send "top up agent gas" "$AGENT_ADDR" --value 500000000000000000
fi

echo
echo "Ready:"
echo "  price          $($CAST call "$FEED" 'getPrice()(uint256)' --rpc-url "$RPC" | awk '{print $1}')"
echo "  health factor  $($CAST call "$POOL" 'healthFactor(address)(uint256)' "$USER_ADDR" --rpc-url "$RPC" | awk '{print $1}')  (expect 1200000000000000000)"
echo "  vault reserve  $(num "$VAULT" 'balances(address)(uint256)' "$USER_ADDR")  (expect 5000000)"
echo
echo "Now run the demo:  ./scripts/crash-arc-demo.sh"
