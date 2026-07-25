// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ScheduledVault.sol";

contract ScheduledVaultFactory {
    mapping(address => address[]) public userVaults;
    address[] public allVaults;

    event VaultCreated(address indexed owner, address indexed vault, address indexed strategy);

    function createVault(address strategy) external returns (address vault) {
        ScheduledVault newVault = new ScheduledVault(msg.sender, strategy);
        vault = address(newVault);
        userVaults[msg.sender].push(vault);
        allVaults.push(vault);
        emit VaultCreated(msg.sender, vault, strategy);
    }

    function getLatestUserVault(address user) external view returns (address) {
        address[] storage vaults = userVaults[user];
        if (vaults.length == 0) {
            return address(0);
        }
        return vaults[vaults.length - 1];
    }

    function getUserVaults(address user) external view returns (address[] memory) {
        return userVaults[user];
    }
}
