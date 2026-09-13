// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {WatchmanVault} from "../src/WatchmanVault.sol";
import {TestUSDC} from "./mocks/TestUSDC.sol";
import {MockHealthFactorSource} from "./mocks/MockHealthFactorSource.sol";
import {MockAdapter} from "./mocks/MockAdapter.sol";

contract WatchmanVaultTest is Test {
    WatchmanVault internal vault;
    TestUSDC internal usdc;
    MockHealthFactorSource internal pool;
    MockAdapter internal adapter;

    address internal user = makeAddr("user");
    address internal agent = makeAddr("agent");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant STARTING_BALANCE = 10_000e6; // 10,000 USDC
    // Health factor threshold representing 1.10, in the same 1e18 scale healthFactor() uses.
    uint256 internal constant HF_1_10 = 1.1e18;
    // Health factor threshold representing 0.90 — below 1.0, clearly unsafe.
    uint256 internal constant HF_0_90 = 0.9e18;

    event DefenseExecuted(
        address indexed user,
        address indexed adapter,
        address indexed pool,
        uint256 amount,
        string reason,
        uint256 timestamp
    );

    function setUp() public {
        usdc = new TestUSDC();
        vault = new WatchmanVault(address(usdc));
        pool = new MockHealthFactorSource();
        adapter = new MockAdapter();

        usdc.mint(user, STARTING_BALANCE);
        vm.prank(user);
        require(usdc.approve(address(vault), type(uint256).max));
    }

    // --------------------------------------------------------------------
    // Deposit / withdraw
    // --------------------------------------------------------------------

    function test_DepositWithdrawRoundTrip() public {
        vm.startPrank(user);
        vault.deposit(1_000e6);
        assertEq(vault.balances(user), 1_000e6);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);
        assertEq(usdc.balanceOf(user), STARTING_BALANCE - 1_000e6);

        vault.withdraw(400e6);
        assertEq(vault.balances(user), 600e6);
        assertEq(usdc.balanceOf(user), STARTING_BALANCE - 600e6);
        vm.stopPrank();
    }

    function test_RevertWhen_WithdrawExceedsBalance() public {
        vm.startPrank(user);
        vault.deposit(100e6);
        vm.expectRevert(WatchmanVault.InsufficientBalance.selector);
        vault.withdraw(200e6);
        vm.stopPrank();
    }

    function test_RevertWhen_DepositZero() public {
        vm.prank(user);
        vm.expectRevert(WatchmanVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    // --------------------------------------------------------------------
    // Agent authorization
    // --------------------------------------------------------------------

    function test_AuthorizeAndRevokeAgent() public {
        assertFalse(vault.isAuthorizedAgent(user, agent));

        vm.prank(user);
        vault.authorizeAgent(agent);
        assertTrue(vault.isAuthorizedAgent(user, agent));

        vm.prank(user);
        vault.revokeAgent(agent);
        assertFalse(vault.isAuthorizedAgent(user, agent));
    }

    function test_RevertWhen_UnauthorizedAgentCallsExecuteDefense() public {
        vm.prank(user);
        vault.deposit(1_000e6);

        vm.prank(user);
        vault.setPolicy(1_000e6, 1_000e6, 11_000);

        // `agent` was never authorized by `user`.
        vm.prank(agent);
        vm.expectRevert(WatchmanVault.NotAuthorizedAgent.selector);
        vault.executeDefense(user, address(adapter), address(pool), 100e6, "unauthorized attempt");
    }

    function test_RevertWhen_RevokedAgentCallsExecuteDefense() public {
        vm.prank(user);
        vault.deposit(1_000e6);
        vm.prank(user);
        vault.setPolicy(1_000e6, 1_000e6, 11_000);

        vm.prank(user);
        vault.authorizeAgent(agent);
        vm.prank(user);
        vault.revokeAgent(agent);

        vm.prank(agent);
        vm.expectRevert(WatchmanVault.NotAuthorizedAgent.selector);
        vault.executeDefense(user, address(adapter), address(pool), 100e6, "revoked attempt");
    }

    // --------------------------------------------------------------------
    // Policy cap enforcement
    // --------------------------------------------------------------------

    function _authorizeAndFund(uint256 depositAmount, uint256 maxPerTx, uint256 maxPerDay, uint256 minHfBps) internal {
        vm.prank(user);
        vault.deposit(depositAmount);
        vm.prank(user);
        vault.authorizeAgent(agent);
        vm.prank(user);
        vault.setPolicy(maxPerTx, maxPerDay, minHfBps);
    }

    function test_RevertWhen_ExceedsPerTxCap() public {
        _authorizeAndFund(1_000e6, 100e6, 1_000e6, 11_000);
        // Pool health factor is irrelevant here: the per-tx cap check reverts first.
        pool.setHealthFactor(user, HF_0_90);

        vm.prank(agent);
        vm.expectRevert(WatchmanVault.ExceedsPerTxCap.selector);
        vault.executeDefense(user, address(adapter), address(pool), 101e6, "over per-tx cap");
    }

    function test_RevertWhen_ExceedsPerDayCap() public {
        _authorizeAndFund(1_000e6, 500e6, 300e6, 11_000);
        pool.setHealthFactor(user, HF_0_90);

        vm.prank(agent);
        vm.expectRevert(WatchmanVault.ExceedsPerDayCap.selector);
        vault.executeDefense(user, address(adapter), address(pool), 301e6, "over per-day cap");
    }

    function test_RevertWhen_ExceedsPerDayCap_AcrossMultipleCalls() public {
        _authorizeAndFund(1_000e6, 500e6, 300e6, 11_000);
        pool.setHealthFactor(user, HF_0_90);

        vm.prank(agent);
        vault.executeDefense(user, address(adapter), address(pool), 200e6, "first defense");
        assertEq(vault.balances(user), 800e6);

        // 200 already spent today; another 200 would total 400 > 300 daily cap.
        vm.prank(agent);
        vm.expectRevert(WatchmanVault.ExceedsPerDayCap.selector);
        vault.executeDefense(user, address(adapter), address(pool), 200e6, "second defense");
    }

    function test_PerDayCap_ResetsAfterWindowElapses() public {
        _authorizeAndFund(1_000e6, 500e6, 300e6, 11_000);
        pool.setHealthFactor(user, HF_0_90);

        vm.prank(agent);
        vault.executeDefense(user, address(adapter), address(pool), 250e6, "day 1 defense");

        // Warp past the 24h window so the rolling cap resets.
        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(agent);
        vault.executeDefense(user, address(adapter), address(pool), 250e6, "day 2 defense");
        assertEq(vault.balances(user), 500e6);
    }

    // --------------------------------------------------------------------
    // Health-factor gating ("defense not needed")
    // --------------------------------------------------------------------

    function test_RevertWhen_DefenseNotNeeded() public {
        _authorizeAndFund(1_000e6, 500e6, 500e6, 11_000);
        // Position is healthy (above the user's 1.10 minimum), so no defense should fire.
        pool.setHealthFactor(user, 1.5e18);

        vm.prank(agent);
        vm.expectRevert(WatchmanVault.DefenseNotNeeded.selector);
        vault.executeDefense(user, address(adapter), address(pool), 100e6, "not needed");
    }

    function test_RevertWhen_InsufficientVaultBalance() public {
        // Authorize + set generous policy but deposit nothing.
        vm.prank(user);
        vault.authorizeAgent(agent);
        vm.prank(user);
        vault.setPolicy(1_000e6, 1_000e6, 11_000);
        pool.setHealthFactor(user, HF_0_90);

        vm.prank(agent);
        vm.expectRevert(WatchmanVault.InsufficientBalance.selector);
        vault.executeDefense(user, address(adapter), address(pool), 100e6, "no funds");
    }

    // --------------------------------------------------------------------
    // Happy path + event + adapter wiring
    // --------------------------------------------------------------------

    function test_ExecuteDefense_HappyPath_CallsAdapterAndEmitsEvent() public {
        _authorizeAndFund(1_000e6, 500e6, 500e6, 11_000);
        pool.setHealthFactor(user, HF_0_90);

        vm.expectEmit(true, true, true, true);
        emit DefenseExecuted(user, address(adapter), address(pool), 200e6, "price crash defense", block.timestamp);

        vm.prank(agent);
        vault.executeDefense(user, address(adapter), address(pool), 200e6, "price crash defense");

        assertEq(vault.balances(user), 800e6);
        assertEq(usdc.balanceOf(address(adapter)), 200e6);
        assertEq(adapter.lastPool(), address(pool));
        assertEq(adapter.lastUser(), user);
        assertEq(adapter.lastAmount(), 200e6);
        assertEq(adapter.callCount(), 1);
    }

    function test_RevertWhen_AdapterDefendFails() public {
        _authorizeAndFund(1_000e6, 500e6, 500e6, 11_000);
        pool.setHealthFactor(user, HF_0_90);
        adapter.setShouldSucceed(false);

        vm.prank(agent);
        vm.expectRevert(WatchmanVault.AdapterDefendFailed.selector);
        vault.executeDefense(user, address(adapter), address(pool), 100e6, "adapter fails");

        // State must roll back entirely on revert.
        assertEq(vault.balances(user), 1_000e6);
    }
}
