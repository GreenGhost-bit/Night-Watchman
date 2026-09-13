// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHealthFactorSource} from "../../src/interfaces/IHealthFactorSource.sol";

/// @notice Test-only stand-in for a lending pool: lets a test directly set the health factor
///         WatchmanVault will read for a given user, without needing a full MockLendingPool
///         (collateral/price/debt) setup. Used for isolated WatchmanVault unit tests; the
///         real MockLendingPool is exercised end-to-end in Integration.t.sol.
contract MockHealthFactorSource is IHealthFactorSource {
    mapping(address => uint256) public healthFactors;

    function setHealthFactor(address user, uint256 value) external {
        healthFactors[user] = value;
    }

    function healthFactor(address user) external view returns (uint256) {
        return healthFactors[user];
    }
}
