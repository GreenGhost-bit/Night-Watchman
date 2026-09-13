// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MockPriceFeed} from "./MockPriceFeed.sol";
import {IHealthFactorSource} from "./interfaces/IHealthFactorSource.sol";

/// @title MockLendingPool
/// @notice Minimal single-market lending pool representing exactly one ETH-collateral /
///         USDC-debt market. This is the Night Watchman demo fixture we fully control (see
///         PROJECT.md section 2): a real Aave/Compound/Morpho/Spark position cannot be forced
///         into liquidation on demand for a live demo, so we deploy this tiny pool on Arc
///         (and, separately, on Sepolia for the Chainlink Automated Liquidation Protection
///         Challenge), seed it with one position, and drive its price via `MockPriceFeed` to
///         create a live liquidation-risk moment for the agent to defend against.
/// @dev Not a general-purpose money market: single collateral asset, single debt asset,
///      single fixed liquidation threshold/bonus. Intentionally simple.
contract MockLendingPool is IHealthFactorSource {
    using SafeERC20 for IERC20;

    struct Position {
        uint256 collateralWeth;
        uint256 debtUsdc;
    }

    /// @notice Collateral asset (18 decimals).
    IERC20 public immutable WETH;
    /// @notice Debt asset (6 decimals, e.g. Arc-native USDC or Sepolia testnet USDC).
    IERC20 public immutable USDC;
    /// @notice Demo-only price oracle for `WETH` denominated in USD, 18-decimal price.
    MockPriceFeed public immutable PRICE_FEED;

    /// @notice Liquidation threshold, in basis points (8000 == 80%).
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 8000;
    /// @notice Bonus (in basis points) paid to whoever calls `liquidate`, on top of the debt
    ///         they repay, as extra seized collateral.
    uint256 public constant LIQUIDATION_BONUS_BPS = 500;
    /// @notice Health factor below this (scaled 1e18) means the position is liquidatable.
    uint256 public constant HEALTH_FACTOR_LIQUIDATION_THRESHOLD = 1e18;
    /// @notice WETH has 18 decimals, USDC has 6 — this constant (1e(18-6)) normalizes USDC
    ///         amounts into the same 1e18 fixed-point scale used for collateral/price math.
    uint256 private constant USDC_DECIMAL_ADJUSTMENT = 1e12;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    mapping(address => Position) public positions;

    event CollateralDeposited(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed caller, address indexed user, uint256 amount);
    event CollateralAdded(address indexed caller, address indexed user, uint256 amount);
    event Liquidated(address indexed liquidator, address indexed user, uint256 debtRepaid, uint256 collateralSeized);

    error ZeroAmount();
    error BorrowExceedsSafeLimit();
    error PositionIsHealthy();
    error NoDebtToLiquidate();

    constructor(address wethAddress, address usdcAddress, address priceFeedAddress) {
        WETH = IERC20(wethAddress);
        USDC = IERC20(usdcAddress);
        PRICE_FEED = MockPriceFeed(priceFeedAddress);
    }

    /// @notice Deposit WETH as collateral for the caller's own position.
    function depositCollateral(uint256 wethAmount) external {
        if (wethAmount == 0) revert ZeroAmount();
        WETH.safeTransferFrom(msg.sender, address(this), wethAmount);
        positions[msg.sender].collateralWeth += wethAmount;
        emit CollateralDeposited(msg.sender, wethAmount);
    }

    /// @notice Borrow USDC against the caller's deposited collateral. Reverts if the resulting
    ///         position would already be unsafe (health factor < 1.0) or if the pool lacks
    ///         sufficient USDC liquidity.
    function borrow(uint256 usdcAmount) external {
        if (usdcAmount == 0) revert ZeroAmount();
        Position storage pos = positions[msg.sender];
        pos.debtUsdc += usdcAmount;
        if (_healthFactor(pos) < HEALTH_FACTOR_LIQUIDATION_THRESHOLD) {
            revert BorrowExceedsSafeLimit();
        }
        USDC.safeTransfer(msg.sender, usdcAmount);
        emit Borrowed(msg.sender, usdcAmount);
    }

    /// @notice Repay `user`'s debt on their behalf. Callable by anyone (in practice, a
    ///         `IProtocolAdapter` acting on behalf of `WatchmanVault`'s defense flow) — the
    ///         caller must hold and have approved the USDC being repaid. This is the primary
    ///         defensive action the Night Watchman agent triggers.
    /// @param usdcAmount Amount to repay; capped at the user's outstanding debt.
    function repayFor(address user, uint256 usdcAmount) external {
        if (usdcAmount == 0) revert ZeroAmount();
        Position storage pos = positions[user];
        uint256 amountToRepay = usdcAmount > pos.debtUsdc ? pos.debtUsdc : usdcAmount;
        if (amountToRepay == 0) revert NoDebtToLiquidate();
        pos.debtUsdc -= amountToRepay;
        USDC.safeTransferFrom(msg.sender, address(this), amountToRepay);
        emit Repaid(msg.sender, user, amountToRepay);
    }

    /// @notice Add collateral to `user`'s position on their behalf. Callable by anyone (in
    ///         practice, an adapter) — this is the alternative defensive action to repaying
    ///         debt. The caller must hold and have approved the WETH being added.
    function addCollateralFor(address user, uint256 wethAmount) external {
        if (wethAmount == 0) revert ZeroAmount();
        WETH.safeTransferFrom(msg.sender, address(this), wethAmount);
        positions[user].collateralWeth += wethAmount;
        emit CollateralAdded(msg.sender, user, wethAmount);
    }

    /// @notice Liquidate `user`'s position once its health factor has dropped below 1.0.
    ///         Anyone may call this. The liquidator repays the user's full outstanding debt
    ///         in USDC and receives the user's WETH collateral plus a liquidation bonus.
    function liquidate(address user) external {
        Position storage pos = positions[user];
        if (pos.debtUsdc == 0) revert NoDebtToLiquidate();
        if (_healthFactor(pos) >= HEALTH_FACTOR_LIQUIDATION_THRESHOLD) revert PositionIsHealthy();

        uint256 debtToRepay = pos.debtUsdc;
        uint256 price = PRICE_FEED.getPrice();

        // Convert the repaid debt (plus liquidation bonus) directly into a WETH amount in a
        // single multiply-then-divide expression (rather than dividing into an intermediate
        // USD value first) to avoid unnecessary precision loss, capped at the position's
        // actual collateral balance.
        uint256 collateralToSeize = price == 0
            ? pos.collateralWeth
            : (debtToRepay * USDC_DECIMAL_ADJUSTMENT * (BPS_DENOMINATOR + LIQUIDATION_BONUS_BPS) * 1e18)
                / (BPS_DENOMINATOR * price);
        if (collateralToSeize > pos.collateralWeth) {
            collateralToSeize = pos.collateralWeth;
        }

        pos.debtUsdc = 0;
        pos.collateralWeth -= collateralToSeize;

        USDC.safeTransferFrom(msg.sender, address(this), debtToRepay);
        WETH.safeTransfer(msg.sender, collateralToSeize);

        emit Liquidated(msg.sender, user, debtToRepay, collateralToSeize);
    }

    /// @notice Health factor for `user`, scaled to 1e18. A position with zero debt is treated
    ///         as maximally healthy (returns `type(uint256).max`) rather than dividing by zero.
    function healthFactor(address user) public view returns (uint256) {
        return _healthFactor(positions[user]);
    }

    function _healthFactor(Position memory pos) private view returns (uint256) {
        if (pos.debtUsdc == 0) return type(uint256).max;
        uint256 price = PRICE_FEED.getPrice();
        // (collateralWeth * price * liqThresholdBps) / (debtUsdc * 10000), normalized from
        // USDC's 6 decimals to the 1e18 fixed-point scale used everywhere else.
        return (pos.collateralWeth * price * LIQUIDATION_THRESHOLD_BPS)
            / (pos.debtUsdc * BPS_DENOMINATOR * USDC_DECIMAL_ADJUSTMENT);
    }
}
