// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockPriceFeed
/// @notice Trivial owner-settable price oracle for the Lamplighter demo fixture.
///
/// @dev THIS IS A DEMO-ONLY FIXTURE, NOT A REAL CHAINLINK PRICE FEED. It exists purely so
///      the frontend can expose a judge-facing "crash the market" button that instantly
///      moves `MockLendingPool`'s collateral valuation and drives a live liquidation-risk
///      demo moment. The real, production-shaped price/risk logic for this project lives in
///      the separate Chainlink CRE Confidential Workflow workstream (`cre-workflow/`), which
///      is what actually gets submitted for the Chainlink tracks — this contract is only
///      ever used to manufacture the on-demand market movement that workflow reacts to.
///      Price is returned with 18 decimals of precision (i.e. `1 ETH = $3000` is
///      represented as `3000e18`).
contract MockPriceFeed is Ownable {
    /// @notice Current price, scaled to 1e18.
    uint256 public price;

    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    /// @param initialOwner Address allowed to update the price (demo admin / frontend signer).
    /// @param initialPrice Starting price, scaled to 1e18.
    constructor(address initialOwner, uint256 initialPrice) Ownable(initialOwner) {
        price = initialPrice;
        emit PriceUpdated(0, initialPrice);
    }

    /// @notice Owner-only "crash the market" (or pump it) lever for the live demo.
    function setPrice(uint256 newPrice) external onlyOwner {
        uint256 old = price;
        price = newPrice;
        emit PriceUpdated(old, newPrice);
    }

    /// @notice Current price, scaled to 1e18.
    function getPrice() external view returns (uint256) {
        return price;
    }
}
