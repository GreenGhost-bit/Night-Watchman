// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockWETH} from "../src/MockWETH.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockPriceFeed} from "../src/MockPriceFeed.sol";
import {MockLendingPool} from "../src/MockLendingPool.sol";
import {MockLendingPoolAdapter} from "../src/adapters/MockLendingPoolAdapter.sol";
import {WatchmanVault} from "../src/WatchmanVault.sol";

/// @title DeploySepolia
/// @notice Deploys the same Night Watchman demo fixture shape as `DeployArc.s.sol`, but to
///         Sepolia -- this is specifically what the Chainlink Automated Liquidation Protection
///         Challenge requires: a Sepolia-deployed ETH-collateral/USDC-debt fixture to
///         `join()` against with a CRE workflow (a separate, user-run step; see root
///         docs/architecture-notes.md section 6).
///
/// @dev Unlike Arc, Sepolia has no chain-native USDC, so by default this script deploys its
///      own `MockUSDC` as the debt asset (see MockUSDC.sol for why). Set the
///      `SEPOLIA_USDC_ADDRESS` env var to point at a real token (e.g. Circle's official
///      Sepolia testnet USDC) instead.
///
///      Reads config from env vars (see root .env.example):
///        - SEPOLIA_RPC_URL              : pass via `--rpc-url` (also wired in foundry.toml's
///                                         [rpc_endpoints] as the `sepolia` alias).
///        - SEPOLIA_DEPLOYER_PRIVATE_KEY : the deployer/owner key; also becomes the initial
///                                         owner of MockPriceFeed.
///        - SEPOLIA_USDC_ADDRESS         : optional; if unset, deploys MockUSDC.
///
///      This script only DEPLOYS and WIRES contracts together, so it dry-runs cleanly against
///      a bare local anvil instance. Actually broadcasting to real Sepolia is a manual,
///      user-run step (see README).
contract DeploySepolia is Script {
    uint256 internal constant INITIAL_ETH_PRICE = 3_000e18; // $3,000 / ETH, demo starting point

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("SEPOLIA_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address usdcOverride = vm.envOr("SEPOLIA_USDC_ADDRESS", address(0));

        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        address usdcAddress;
        if (usdcOverride == address(0)) {
            MockUSDC usdc = new MockUSDC();
            usdc.mint(deployer, 1_000_000e6);
            usdcAddress = address(usdc);
            console.log("MockUSDC deployed at:", usdcAddress);
        } else {
            usdcAddress = usdcOverride;
            console.log("Using existing USDC at:", usdcAddress);
        }

        MockWETH weth = new MockWETH();
        console.log("MockWETH deployed at:", address(weth));

        MockPriceFeed priceFeed = new MockPriceFeed(deployer, INITIAL_ETH_PRICE);
        console.log("MockPriceFeed deployed at:", address(priceFeed));

        MockLendingPool pool = new MockLendingPool(address(weth), usdcAddress, address(priceFeed));
        console.log("MockLendingPool deployed at:", address(pool));

        MockLendingPoolAdapter adapter = new MockLendingPoolAdapter();
        console.log("MockLendingPoolAdapter deployed at:", address(adapter));

        WatchmanVault vault = new WatchmanVault(usdcAddress);
        console.log("WatchmanVault deployed at:", address(vault));

        vm.stopBroadcast();

        console.log("---");
        console.log("Sepolia deployment complete. Fill these into agent/.env, frontend/.env,");
        console.log("and the Chainlink Liquidation Protection Challenge join() call:");
        console.log("SEPOLIA_USDC_ADDRESS=", usdcAddress);
        console.log("MOCK_WETH_ADDRESS=", address(weth));
        console.log("MOCK_PRICE_FEED_ADDRESS=", address(priceFeed));
        console.log("MOCK_LENDING_POOL_ADDRESS=", address(pool));
        console.log("MOCK_LENDING_POOL_ADAPTER_ADDRESS=", address(adapter));
        console.log("WATCHMAN_VAULT_ADDRESS=", address(vault));
    }
}
