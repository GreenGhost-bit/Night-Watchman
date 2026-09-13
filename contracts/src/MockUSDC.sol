// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal mintable 6-decimal ERC20 standing in for USDC on Sepolia only.
///
/// @dev Arc's deploy script (`DeployArc.s.sol`) deliberately does NOT use this -- Arc has a
///      real, always-available native USDC contract at a known address, so mocking USDC there
///      would be dishonest about what's simulated. Sepolia has no equivalent chain-native
///      USDC, and the Chainlink Automated Liquidation Protection Challenge only requires a
///      Sepolia-deployed ETH-collateral/USDC-debt fixture to register against -- it does not
///      require any specific token contract -- so `DeploySepolia.s.sol` deploys this
///      project-owned token as the debt asset by default (kept fully self-contained rather
///      than hardcoding a third-party testnet USDC address from memory). If you'd rather wire
///      the fixture to Circle's official Sepolia testnet USDC (see
///      https://developers.circle.com/stablecoins/usdc-on-test-networks), set
///      `SEPOLIA_USDC_ADDRESS` before deploying and `DeploySepolia.s.sol` will use that
///      instead of deploying this token.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "mUSDC") {}

    /// @notice Mint demo USDC. Open to anyone — this is a testnet fixture, not a real asset.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
