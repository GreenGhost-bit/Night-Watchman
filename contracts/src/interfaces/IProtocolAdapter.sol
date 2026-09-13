// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IProtocolAdapter
/// @notice Common interface WatchmanVault uses to trigger a defensive action on a specific
///         lending protocol integration ("adapter"). Each adapter translates the generic
///         `defend()` call into whatever protocol-specific calls are needed (repay debt,
///         add collateral, etc). This indirection is what lets WatchmanVault stay protocol-agnostic.
interface IProtocolAdapter {
    /// @notice Execute a defensive action for `user`'s position in `pool`.
    /// @param pool The protocol-specific pool/market address to act on.
    /// @param user The user whose position is being defended.
    /// @param amount The amount (in the pool's debt-asset units) to apply to the defense.
    /// @return success True if the defensive action completed successfully.
    function defend(address pool, address user, uint256 amount) external returns (bool success);
}
