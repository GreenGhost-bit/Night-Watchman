// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockWETH
/// @notice Minimal mintable 18-decimal ERC20 standing in for WETH as collateral in the
///         Night Watchman demo fixture (see MockLendingPool). This is a TESTNET DEMO TOKEN
///         ONLY — it has no relationship to real WETH and carries no value. `mint` is
///         intentionally open to anyone so the demo can freely seed collateral positions.
contract MockWETH is ERC20 {
    constructor() ERC20("Mock Wrapped Ether", "mWETH") {}

    /// @notice Mint demo collateral tokens. Open to anyone — this is a testnet fixture, not
    ///         a real asset, so there is no access control to bypass.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
