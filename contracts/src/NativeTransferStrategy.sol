// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IExecutionStrategy.sol";

contract NativeTransferStrategy is IExecutionStrategy {
    function validateConfig(bytes calldata config) external pure override {
        require(config.length == 64, "Invalid config length");
        (address recipient, uint256 amount) = abi.decode(config, (address, uint256));
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
    }

    function plan(bytes calldata config) external pure override returns (Action[] memory actions) {
        (address recipient, uint256 amount) = abi.decode(config, (address, uint256));
        actions = new Action[](1);
        actions[0] = Action({
            target: recipient,
            value: amount,
            data: ""
        });
    }
}
