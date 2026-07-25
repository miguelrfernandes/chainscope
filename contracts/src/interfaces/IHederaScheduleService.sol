// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IHederaScheduleService {
    function scheduleCall(
        address targetContract,
        uint256 expiryTimestamp,
        uint256 gasLimit,
        uint64 value,
        bytes calldata callData
    ) external returns (int64 responseCode, address scheduleAddress);
}
