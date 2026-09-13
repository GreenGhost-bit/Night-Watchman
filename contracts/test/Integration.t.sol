// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {WatchmanVault} from "../src/WatchmanVault.sol";
import {MockLendingPool} from "../src/MockLendingPool.sol";
import {MockLendingPoolAdapter} from "../src/adapters/MockLendingPoolAdapter.sol";
import {MockPriceFeed} from "../src/MockPriceFeed.sol";
import {MockWETH} from "../src/MockWETH.sol";
import {TestUSDC} from "./mocks/TestUSDC.sol";

/// @notice End-to-end happy path matching PROJECT.md's demo narrative: a user's position on
///         MockLendingPool gets pushed underwater by a live price crash, and their
///         pre-authorized agent calls WatchmanVault.executeDefense to repay enough debt to
///         restore the position above the user's own configured safety threshold — the same
///         mechanism the off-chain risk agent and Chainlink CRE workflow trigger for real.
contract IntegrationTest is Test {
    WatchmanVault internal vault;
    MockLendingPool internal pool;
    MockLendingPoolAdapter internal adapter;
    MockPriceFeed internal priceFeed;
    MockWETH internal weth;
    TestUSDC internal usdc;

    address internal user = makeAddr("user");
    address internal agent = makeAddr("agent");

    uint256 internal constant INITIAL_PRICE = 3_000e18;
    uint256 internal constant CRASHED_PRICE = 2_000e18;
    // User requires health factor to stay above 1.10.
    uint256 internal constant MIN_HEALTH_FACTOR_BPS = 11_000;

    event DefenseExecuted(
        address indexed user,
        address indexed adapter,
        address indexed pool,
        uint256 amount,
        string reason,
        uint256 timestamp
    );

    function setUp() public {
        weth = new MockWETH();
        usdc = new TestUSDC();
        priceFeed = new MockPriceFeed(address(this), INITIAL_PRICE);
        pool = new MockLendingPool(address(weth), address(usdc), address(priceFeed));
        adapter = new MockLendingPoolAdapter();
        vault = new WatchmanVault(address(usdc));

        // Seed pool liquidity so the user can actually borrow against their collateral.
        usdc.mint(address(pool), 1_000_000e6);

        // User opens a 1 WETH collateral / $2,000 USDC debt position directly on the pool.
        weth.mint(user, 1e18);
        vm.startPrank(user);
        require(weth.approve(address(pool), type(uint256).max));
        pool.depositCollateral(1e18);
        pool.borrow(2_000e6);
        vm.stopPrank();

        // At $3,000/ETH: HF = (1 * 3000 * 0.8) / 2000 = 1.2 (safe, above 1.10 policy floor).
        assertEq(pool.healthFactor(user), 1.2e18);

        // User funds their WatchmanVault "defense war chest" and sets up the human-in-the-loop
        // safety layer: an authorized agent, capped per-tx/per-day spend, and a health-factor
        // floor that must actually be breached before the agent may spend anything.
        usdc.mint(user, 5_000e6);
        vm.startPrank(user);
        require(usdc.approve(address(vault), type(uint256).max));
        vault.deposit(5_000e6);
        vault.authorizeAgent(agent);
        vault.setPolicy(1_000e6, 1_000e6, MIN_HEALTH_FACTOR_BPS);
        vm.stopPrank();
    }

    function test_FullLiquidationDefenseHappyPath() public {
        // Live demo moment: crash the price feed.
        priceFeed.setPrice(CRASHED_PRICE);

        // HF = (1 * 2000 * 0.8) / 2000 = 0.8 -- below both the 1.0 liquidation line and the
        // user's 1.10 policy floor.
        uint256 hfAfterCrash = pool.healthFactor(user);
        assertEq(hfAfterCrash, 0.8e18);
        assertLt(hfAfterCrash, 1e18);

        uint256 minHealthFactorScaled = MIN_HEALTH_FACTOR_BPS * 1e14;
        assertLt(hfAfterCrash, minHealthFactorScaled);

        // The authorized agent defends the position by repaying $1,000 of debt.
        uint256 defenseAmount = 1_000e6;

        vm.expectEmit(true, true, true, true);
        emit DefenseExecuted(
            user, address(adapter), address(pool), defenseAmount, "risk-agent: HF below floor", block.timestamp
        );

        vm.prank(agent);
        vault.executeDefense(user, address(adapter), address(pool), defenseAmount, "risk-agent: HF below floor");

        // Debt dropped from $2,000 to $1,000: HF = (1 * 2000 * 0.8) / 1000 = 1.6.
        uint256 hfAfterDefense = pool.healthFactor(user);
        assertEq(hfAfterDefense, 1.6e18);
        assertGt(hfAfterDefense, minHealthFactorScaled);

        // Vault balance and pool debt both moved by exactly the defense amount.
        assertEq(vault.balances(user), 4_000e6);
        (uint256 collateralWeth, uint256 debtUsdc) = pool.positions(user);
        assertEq(collateralWeth, 1e18);
        assertEq(debtUsdc, 1_000e6);

        // The position is no longer liquidatable.
        vm.expectRevert(MockLendingPool.PositionIsHealthy.selector);
        pool.liquidate(user);
    }

    function test_NoDefenseFiresWhilePositionIsHealthy() public {
        // Price hasn't moved; position is still safely above the policy floor.
        vm.prank(agent);
        vm.expectRevert(WatchmanVault.DefenseNotNeeded.selector);
        vault.executeDefense(user, address(adapter), address(pool), 500e6, "premature");
    }

    function test_LiquidationSucceedsIfDefenseNeverFires() public {
        // Crash the price hard enough that even a full repay by a third party is the only
        // recourse -- simulate the agent never showing up and a liquidator stepping in.
        priceFeed.setPrice(CRASHED_PRICE);
        assertLt(pool.healthFactor(user), 1e18);

        address liquidator = makeAddr("liquidator");
        usdc.mint(liquidator, 2_000e6);
        vm.startPrank(liquidator);
        require(usdc.approve(address(pool), type(uint256).max));
        pool.liquidate(user);
        vm.stopPrank();

        (uint256 collateralWeth, uint256 debtUsdc) = pool.positions(user);
        assertEq(collateralWeth, 0);
        assertEq(debtUsdc, 0);
    }
}
