// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockLendingPool} from "../src/MockLendingPool.sol";
import {MockPriceFeed} from "../src/MockPriceFeed.sol";
import {MockWETH} from "../src/MockWETH.sol";
import {TestUSDC} from "./mocks/TestUSDC.sol";

contract MockLendingPoolTest is Test {
    MockLendingPool internal pool;
    MockPriceFeed internal priceFeed;
    MockWETH internal weth;
    TestUSDC internal usdc;

    address internal owner = address(this);
    address internal borrower = makeAddr("borrower");
    address internal liquidator = makeAddr("liquidator");

    uint256 internal constant INITIAL_PRICE = 3_000e18; // $3,000 / ETH
    uint256 internal constant POOL_USDC_LIQUIDITY = 1_000_000e6;

    function setUp() public {
        weth = new MockWETH();
        usdc = new TestUSDC();
        priceFeed = new MockPriceFeed(owner, INITIAL_PRICE);
        pool = new MockLendingPool(address(weth), address(usdc), address(priceFeed));

        // Seed the pool with USDC liquidity so borrows have something to draw from.
        usdc.mint(address(pool), POOL_USDC_LIQUIDITY);

        weth.mint(borrower, 10e18);
        vm.prank(borrower);
        require(weth.approve(address(pool), type(uint256).max));
    }

    function test_HealthFactorNoDebtIsMax() public view {
        assertEq(pool.healthFactor(borrower), type(uint256).max);
    }

    function test_DepositBorrow_ComputesExpectedHealthFactor() public {
        vm.prank(borrower);
        pool.depositCollateral(1e18); // 1 WETH == $3,000
        vm.prank(borrower);
        pool.borrow(2_000e6); // $2,000 debt

        // HF = (1 * 3000 * 0.80) / 2000 = 1.2
        assertEq(pool.healthFactor(borrower), 1.2e18);
        assertEq(usdc.balanceOf(borrower), 2_000e6);
    }

    function test_RevertWhen_BorrowExceedsSafeLimit() public {
        vm.prank(borrower);
        pool.depositCollateral(1e18); // $3,000 collateral

        // Borrowing $2,500 against $3,000 collateral at an 80% threshold gives
        // HF = 3000*0.8/2500 = 0.96 < 1.0 -> unsafe, should revert.
        vm.prank(borrower);
        vm.expectRevert(MockLendingPool.BorrowExceedsSafeLimit.selector);
        pool.borrow(2_500e6);
    }

    function test_PriceDrop_DropsHealthFactorBelowOne() public {
        vm.prank(borrower);
        pool.depositCollateral(1e18);
        vm.prank(borrower);
        pool.borrow(2_000e6);
        assertGt(pool.healthFactor(borrower), 1e18);

        // Crash ETH from $3,000 to $2,000: HF = 2000*0.8/2000 = 0.8 < 1.0
        priceFeed.setPrice(2_000e18);
        assertEq(pool.healthFactor(borrower), 0.8e18);
        assertLt(pool.healthFactor(borrower), 1e18);
    }

    function test_RepayFor_ReducesDebtAndRestoresHealthFactor() public {
        vm.prank(borrower);
        pool.depositCollateral(1e18);
        vm.prank(borrower);
        pool.borrow(2_000e6);

        priceFeed.setPrice(2_000e18); // HF drops to 0.8

        address repayer = makeAddr("repayer");
        usdc.mint(repayer, 1_000e6);
        vm.prank(repayer);
        require(usdc.approve(address(pool), type(uint256).max));

        vm.prank(repayer);
        pool.repayFor(borrower, 1_000e6);

        // Remaining debt $1,000 against $2,000 collateral: HF = 2000*0.8/1000 = 1.6
        assertEq(pool.healthFactor(borrower), 1.6e18);
        (uint256 collateralWeth, uint256 debtUsdc) = pool.positions(borrower);
        assertEq(collateralWeth, 1e18);
        assertEq(debtUsdc, 1_000e6);
    }

    function test_AddCollateralFor_IncreasesCollateralAndHealthFactor() public {
        vm.prank(borrower);
        pool.depositCollateral(1e18);
        vm.prank(borrower);
        pool.borrow(2_000e6);
        priceFeed.setPrice(2_000e18); // HF = 0.8

        address helper = makeAddr("helper");
        weth.mint(helper, 1e18);
        vm.prank(helper);
        require(weth.approve(address(pool), type(uint256).max));

        vm.prank(helper);
        pool.addCollateralFor(borrower, 1e18);

        // Now 2 WETH collateral at $2,000: HF = (2*2000*0.8)/2000 = 1.6
        assertEq(pool.healthFactor(borrower), 1.6e18);
    }

    function test_RevertWhen_LiquidateHealthyPosition() public {
        vm.prank(borrower);
        pool.depositCollateral(1e18);
        vm.prank(borrower);
        pool.borrow(2_000e6);

        vm.expectRevert(MockLendingPool.PositionIsHealthy.selector);
        pool.liquidate(borrower);
    }

    function test_RevertWhen_LiquidateNoDebt() public {
        vm.expectRevert(MockLendingPool.NoDebtToLiquidate.selector);
        pool.liquidate(borrower);
    }

    function test_Liquidate_SucceedsWhenUnderwater() public {
        vm.prank(borrower);
        pool.depositCollateral(1e18); // 1 WETH
        vm.prank(borrower);
        pool.borrow(2_000e6); // $2,000 debt

        priceFeed.setPrice(2_000e18); // HF = 0.8 -> liquidatable

        usdc.mint(liquidator, 2_000e6);
        vm.prank(liquidator);
        require(usdc.approve(address(pool), type(uint256).max));

        uint256 liquidatorWethBefore = weth.balanceOf(liquidator);

        vm.prank(liquidator);
        pool.liquidate(borrower);

        (uint256 collateralWeth, uint256 debtUsdc) = pool.positions(borrower);
        assertEq(debtUsdc, 0);

        // Seized WETH = (2000 debt * 1.05 bonus) / $2,000 price = 1.05 WETH, capped at the
        // 1 WETH actually posted as collateral.
        uint256 seized = weth.balanceOf(liquidator) - liquidatorWethBefore;
        assertEq(seized, 1e18);
        assertEq(collateralWeth, 0);
    }
}
