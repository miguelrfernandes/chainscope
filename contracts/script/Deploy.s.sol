// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/NativeTransferStrategy.sol";
import "../src/ScheduledVaultFactory.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        NativeTransferStrategy strategy = new NativeTransferStrategy();
        console.log("NativeTransferStrategy deployed to:", address(strategy));

        ScheduledVaultFactory factory = new ScheduledVaultFactory();
        console.log("ScheduledVaultFactory deployed to:", address(factory));

        vm.stopBroadcast();
    }
}
