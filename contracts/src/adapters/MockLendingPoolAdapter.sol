// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IProtocolAdapter} from "../interfaces/IProtocolAdapter.sol";
import {MockLendingPool} from "../MockLendingPool.sol";

/// @title MockLendingPoolAdapter
/// @notice Translates the generic `IProtocolAdapter.defend()` call from `WatchmanVault` into
///         a concrete action on `MockLendingPool`. Repaying debt is chosen as the primary
///         defensive action (rather than adding collateral) because it is the most legible
///         "we saved the position" story for a live demo: the health factor visibly jumps
///         back up the moment the repay lands on-chain.
contract MockLendingPoolAdapter is IProtocolAdapter {
    using SafeERC20 for IERC20;

    /// @notice Executes the defense by repaying `amount` of `user`'s debt on `pool`.
    /// @dev Expects to have already received `amount` of the pool's debt asset (USDC) from
    ///      the caller (`WatchmanVault.executeDefense` transfers it in before calling this).
    function defend(address pool, address user, uint256 amount) external returns (bool) {
        MockLendingPool lendingPool = MockLendingPool(pool);
        IERC20 usdc = lendingPool.USDC();
        usdc.forceApprove(pool, amount);
        lendingPool.repayFor(user, amount);
        return true;
    }
}
