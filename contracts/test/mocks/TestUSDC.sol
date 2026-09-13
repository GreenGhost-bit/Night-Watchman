// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only 6-decimal ERC20 standing in for USDC in the test suite. Production
///         deploy scripts never deploy this — Arc uses the real Arc-native USDC address, and
///         Sepolia uses Circle's published testnet USDC — this exists purely so tests don't
///         depend on a live network's token contract.
contract TestUSDC is ERC20 {
    constructor() ERC20("Test USD Coin", "tUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
