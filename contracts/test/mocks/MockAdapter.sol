// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IProtocolAdapter} from "../../src/interfaces/IProtocolAdapter.sol";

/// @notice Test-only IProtocolAdapter whose success/failure is directly controllable, and
///         which records the last call it received, so WatchmanVault unit tests can assert
///         on exactly what was forwarded to the adapter without depending on MockLendingPool.
contract MockAdapter is IProtocolAdapter {
    bool public shouldSucceed = true;

    address public lastPool;
    address public lastUser;
    uint256 public lastAmount;
    uint256 public callCount;

    function setShouldSucceed(bool value) external {
        shouldSucceed = value;
    }

    function defend(address pool, address user, uint256 amount) external returns (bool) {
        require(pool != address(0) && user != address(0), "zero address");
        lastPool = pool;
        lastUser = user;
        lastAmount = amount;
        callCount += 1;
        return shouldSucceed;
    }
}
