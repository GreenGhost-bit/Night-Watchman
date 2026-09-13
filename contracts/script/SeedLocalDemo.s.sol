// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockWETH} from "../src/MockWETH.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockLendingPool} from "../src/MockLendingPool.sol";
import {WatchmanVault} from "../src/WatchmanVault.sol";

/// @title SeedLocalDemo
/// @notice Seeds a live, defendable demo position on top of an already-deployed
///         `DeploySepolia.s.sol` (or `DeployArc.s.sol` with a mintable debt asset) stack —
///         LOCAL/DEMO USE ONLY, never run against a real network with real value.
///
/// @dev Discovered while wiring up the agent orchestrator: `MockLendingPool` has no supply-side
///      liquidity mechanism of its own (see MockLendingPool.sol — "Intentionally simple"), so a
///      fresh pool has zero USDC to lend out. Step 1 below funds it directly via `MockUSDC.mint`
///      (only possible because Sepolia's default deploy uses the project's own mintable
///      MockUSDC, not real USDC — this script will revert on Arc, where minting the real USDC
///      contract is obviously not possible; that's expected, Arc's demo position must be seeded
///      by acquiring real testnet USDC from https://faucet.circle.com instead).
///
///      Opens a position at $3,000/ETH, 10 WETH collateral, $20,000 USDC debt -> health factor
///      1.20 (matches DeployArc/DeploySepolia's INITIAL_ETH_PRICE) with headroom above the
///      1.10 policy threshold set below, so the position starts healthy and only needs defending
///      once `MockPriceFeed.setPrice` is used to crash it live during the demo.
///
///      Env vars (read from root .env — see docs/architecture-notes.md section 7 for the full local dry-run
///      sequence this script is one step of):
///        - DEPLOYER_PRIVATE_KEY : same key used to deploy (becomes the demo position's owner)
///        - AGENT_ADDRESS        : the address `agent/.env`'s AGENT_PRIVATE_KEY derives to
///        - MOCK_WETH_ADDRESS, USDC_ADDRESS, MOCK_LENDING_POOL_ADDRESS, WATCHMAN_VAULT_ADDRESS
///          : this deployment's printed addresses
contract SeedLocalDemo is Script {
    uint256 internal constant COLLATERAL_WETH = 10e18; // 10 ETH
    uint256 internal constant BORROW_USDC = 20_000e6; // $20,000 at $3,000/ETH -> HF 1.20
    uint256 internal constant POOL_LIQUIDITY_USDC = 1_000_000e6; // plenty of USDC for the pool to lend out
    uint256 internal constant VAULT_RESERVE_USDC = 5_000e6; // the "insurance fund" WatchmanVault can spend
    uint256 internal constant MAX_SPEND_PER_TX = 5_000e6;
    uint256 internal constant MAX_SPEND_PER_DAY = 5_000e6;
    uint256 internal constant MIN_HEALTH_FACTOR_BPS = 11_000; // defend once HF <= 1.10

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address agent = vm.envAddress("AGENT_ADDRESS");

        MockWETH weth = MockWETH(vm.envAddress("MOCK_WETH_ADDRESS"));
        MockUSDC usdc = MockUSDC(vm.envAddress("USDC_ADDRESS"));
        MockLendingPool pool = MockLendingPool(vm.envAddress("MOCK_LENDING_POOL_ADDRESS"));
        WatchmanVault vault = WatchmanVault(vm.envAddress("WATCHMAN_VAULT_ADDRESS"));

        console.log("Seeding demo position for:", deployer);
        console.log("Authorizing agent:", agent);

        vm.startBroadcast(deployerKey);

        // 1. Give the pool USDC liquidity to lend out (see the @dev note above).
        usdc.mint(address(pool), POOL_LIQUIDITY_USDC);

        // 2. Open the collateral/debt position.
        weth.mint(deployer, COLLATERAL_WETH);
        require(weth.approve(address(pool), COLLATERAL_WETH), "weth approve failed");
        pool.depositCollateral(COLLATERAL_WETH);
        pool.borrow(BORROW_USDC);

        // 3. Fund WatchmanVault's insurance reserve and wire up the agent + policy.
        usdc.mint(deployer, VAULT_RESERVE_USDC);
        require(usdc.approve(address(vault), VAULT_RESERVE_USDC), "usdc approve failed");
        vault.deposit(VAULT_RESERVE_USDC);
        vault.authorizeAgent(agent);
        vault.setPolicy(MAX_SPEND_PER_TX, MAX_SPEND_PER_DAY, MIN_HEALTH_FACTOR_BPS);

        vm.stopBroadcast();

        console.log("---");
        console.log("Seeded. Starting health factor (expect 1.20e18):");
        console.log(pool.healthFactor(deployer));
        console.log("Crash the price below ~$2,750 (MockPriceFeed.setPrice) to trigger a defense.");
    }
}
