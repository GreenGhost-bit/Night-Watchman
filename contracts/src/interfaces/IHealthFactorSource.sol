// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IHealthFactorSource
/// @notice Minimal read-only interface a lending pool exposes so WatchmanVault can check,
///         protocol-agnostically, whether a user's position actually needs defending before
///         it spends any of the user's deposited USDC.
interface IHealthFactorSource {
    /// @notice Health factor for `user`, scaled to 1e18 (1e18 == a health factor of exactly 1.0).
    function healthFactor(address user) external view returns (uint256);
}
