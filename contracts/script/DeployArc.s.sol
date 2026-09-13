// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockWETH} from "../src/MockWETH.sol";
import {MockPriceFeed} from "../src/MockPriceFeed.sol";
import {MockLendingPool} from "../src/MockLendingPool.sol";
import {MockLendingPoolAdapter} from "../src/adapters/MockLendingPoolAdapter.sol";
import {WatchmanVault} from "../src/WatchmanVault.sol";

/// @title DeployArc
/// @notice Deploys the full Night Watchman demo fixture to Arc testnet (chain 5042002).
///
/// @dev Wires MockLendingPool to the REAL Arc-native USDC contract
///      (`0x3600000000000000000000000000000000000000`) as its debt asset -- unlike Sepolia,
///      Arc's native USDC is a first-class, always-available part of the chain itself, so
///      there is no reason (and PROJECT.md explicitly forbids) deploying a mock USDC here.
///      Only the collateral asset (WETH) and the price oracle are mocked, since those are the
///      pieces we need live "crash the market" control over for the demo.
///
///      Reads config from env vars (see root .env.example):
///        - ARC_TESTNET_RPC_URL   : pass via `--rpc-url` (also wired in foundry.toml's
///                                  [rpc_endpoints] as the `arc_testnet` alias).
///        - ARC_DEPLOYER_PRIVATE_KEY : the deployer/owner key; also becomes the initial owner
///                                  of MockPriceFeed (the demo's "crash the market" lever).
///        - ARC_USDC_ADDRESS      : optional override, defaults to the known Arc testnet USDC
///                                  address above.
///
///      This script only DEPLOYS and WIRES contracts together -- it deliberately makes no
///      calls into the USDC contract (no transfer/approve/mint), so it dry-runs cleanly
///      against a bare local anvil instance where that address has no deployed bytecode.
///      Actually broadcasting to real Arc testnet is a manual, user-run step (see README).
contract DeployArc is Script {
    address internal constant ARC_USDC_DEFAULT = 0x3600000000000000000000000000000000000000;
    uint256 internal constant INITIAL_ETH_PRICE = 3_000e18; // $3,000 / ETH, demo starting point

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("ARC_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address usdcAddress = vm.envOr("ARC_USDC_ADDRESS", ARC_USDC_DEFAULT);

        console.log("Deployer:", deployer);
        console.log("Arc USDC (debt asset):", usdcAddress);

        vm.startBroadcast(deployerPrivateKey);

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
        console.log("Arc deployment complete. Fill these into agent/.env and frontend/.env:");
        console.log("MOCK_WETH_ADDRESS=", address(weth));
        console.log("MOCK_PRICE_FEED_ADDRESS=", address(priceFeed));
        console.log("MOCK_LENDING_POOL_ADDRESS=", address(pool));
        console.log("MOCK_LENDING_POOL_ADAPTER_ADDRESS=", address(adapter));
        console.log("WATCHMAN_VAULT_ADDRESS=", address(vault));
    }
}
