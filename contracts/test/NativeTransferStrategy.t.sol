// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/NativeTransferStrategy.sol";

contract NativeTransferStrategyTest is Test {
    NativeTransferStrategy public strategy;

    function setUp() public {
        strategy = new NativeTransferStrategy();
    }

    function test_ValidateConfigSuccess() public view {
        bytes memory config = abi.encode(address(0x1234567890123456789012345678901234567890), uint256(1 ether));
        strategy.validateConfig(config);
    }

    function test_ValidateConfigRevertWrongLength() public {
        bytes memory badConfig = abi.encodePacked(address(0x123));
        vm.expectRevert("Invalid config length");
        strategy.validateConfig(badConfig);
    }

    function test_ValidateConfigRevertZeroRecipient() public {
        bytes memory badConfig = abi.encode(address(0), uint256(1 ether));
        vm.expectRevert("Invalid recipient");
        strategy.validateConfig(badConfig);
    }

    function test_PlanSuccess() public view {
        address recipient = address(0x1234567890123456789012345678901234567890);
        uint256 amount = 2.5 ether;
        bytes memory config = abi.encode(recipient, amount);

        IExecutionStrategy.Action[] memory actions = strategy.plan(config);
        assertEq(actions.length, 1);
        assertEq(actions[0].target, recipient);
        assertEq(actions[0].value, amount);
        assertEq(actions[0].data, "");
    }
}
