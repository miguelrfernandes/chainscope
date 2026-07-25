// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IExecutionStrategy {
    struct Action {
        address target;
        uint256 value;
        bytes data;
    }

    function validateConfig(bytes calldata config) external pure;
    function plan(bytes calldata config) external pure returns (Action[] memory actions);
}
