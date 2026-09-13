// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockWETH} from "../src/MockWETH.sol";
import {MockLendingPool} from "../src/MockLendingPool.sol";
import {WatchmanVault} from "../src/WatchmanVault.sol";

/// @title SeedArcDemo
/// @notice Seeds a live, defendable position on Arc testnet on top of `DeployArc.s.sol`.
///
/// @dev The Arc counterpart to SeedLocalDemo. The difference that forces a separate script:
///      Arc's debt asset is real native USDC, which has no `mint`. SeedLocalDemo funds the
///      pool's lending liquidity with `MockUSDC.mint`; here that liquidity has to be
///      *transferred* out of the deployer's own faucet balance instead. Collateral is still
///      MockWETH, which we do control and can mint freely.
///
///      Amounts are therefore sized to a faucet balance (https://faucet.circle.com), not to
///      the six-figure numbers the local script uses. The health factors are deliberately
///      identical to the local demo — only the dollar amounts shrink:
///
///        0.005 WETH collateral @ $3,000 = $15.00
///        $10 USDC debt
///        HF = (15 * 0.80) / 10 = 1.20        <- starts healthy, above the 1.10 policy floor
///        after crashing the feed to $2,600:
///        HF = (13 * 0.80) / 10 = 1.04        <- breaches the floor, defense fires
///        after a $2.50 repay:
///        HF = (13 * 0.80) / 7.5 = 1.386      <- restored
///
///      Total USDC leaving the deployer: $10 pool liquidity + $5 vault reserve = $15.
///
///      Env vars (root .env):
///        - ARC_DEPLOYER_PRIVATE_KEY : deployer, and the demo position's owner
///        - AGENT_ADDRESS            : address that AGENT_PRIVATE_KEY derives to
///        - ARC_USDC_ADDRESS, MOCK_WETH_ADDRESS, MOCK_LENDING_POOL_ADDRESS,
///          WATCHMAN_VAULT_ADDRESS   : from DeployArc's printed output
contract SeedArcDemo is Script {
    uint256 internal constant COLLATERAL_WETH = 5e15; // 0.005 WETH = $15 at $3,000
    uint256 internal constant BORROW_USDC = 10e6; // $10 -> HF 1.20
    uint256 internal constant POOL_LIQUIDITY_USDC = 10e6; // exactly what gets borrowed
    uint256 internal constant VAULT_RESERVE_USDC = 5e6; // the insurance float
    uint256 internal constant MAX_SPEND_PER_TX = 25e5; // $2.50
    uint256 internal constant MAX_SPEND_PER_DAY = 5e6; // $5.00
    uint256 internal constant MIN_HEALTH_FACTOR_BPS = 11_000; // defend once HF <= 1.10

    function run() external {
        uint256 deployerKey = vm.envUint("ARC_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address agent = vm.envAddress("AGENT_ADDRESS");

        MockWETH weth = MockWETH(vm.envAddress("MOCK_WETH_ADDRESS"));
        IERC20 usdc = IERC20(vm.envAddress("ARC_USDC_ADDRESS"));
        MockLendingPool pool = MockLendingPool(vm.envAddress("MOCK_LENDING_POOL_ADDRESS"));
        WatchmanVault vault = WatchmanVault(vm.envAddress("WATCHMAN_VAULT_ADDRESS"));

        uint256 balance = usdc.balanceOf(deployer);
        console.log("Deployer:", deployer);
        console.log("USDC balance (6dp):", balance);
        require(
            balance >= POOL_LIQUIDITY_USDC + VAULT_RESERVE_USDC,
            "insufficient USDC: top up at https://faucet.circle.com"
        );

        vm.startBroadcast(deployerKey);

        // 1. Real USDC transfer — the pool has no supply side of its own, so it cannot
        //    lend out what it does not hold. No mint available here, unlike the local script.
        require(usdc.transfer(address(pool), POOL_LIQUIDITY_USDC), "pool funding failed");

        // 2. Open the collateral/debt position. WETH is our own mock, so minting is fine.
        weth.mint(deployer, COLLATERAL_WETH);
        require(weth.approve(address(pool), COLLATERAL_WETH), "weth approve failed");
        pool.depositCollateral(COLLATERAL_WETH);
        pool.borrow(BORROW_USDC);

        // 3. Fund the vault's reserve, authorize the agent, and set the user-owned policy.
        require(usdc.approve(address(vault), VAULT_RESERVE_USDC), "usdc approve failed");
        vault.deposit(VAULT_RESERVE_USDC);
        vault.authorizeAgent(agent);
        vault.setPolicy(MAX_SPEND_PER_TX, MAX_SPEND_PER_DAY, MIN_HEALTH_FACTOR_BPS);

        vm.stopBroadcast();

        console.log("---");
        console.log("Seeded on Arc. Health factor (expect 1.2e18):");
        console.log(pool.healthFactor(deployer));
        console.log("Crash MockPriceFeed below ~$2,750 to trigger a defense.");
    }
}
