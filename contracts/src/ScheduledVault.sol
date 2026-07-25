// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IHederaScheduleService.sol";
import "./interfaces/IExecutionStrategy.sol";

contract ScheduledVault is Ownable, ReentrancyGuard {
    address public constant HEDERA_SCHEDULE_SERVICE = 0x000000000000000000000000000000000000016B;

    IExecutionStrategy public immutable strategy;
    bytes public config;
    uint256 public interval;
    address public lastScheduleAddress;

    event Configured(bytes config, uint256 interval);
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event Scheduled(address scheduleAddress);
    event Executed(uint256 timestamp);

    constructor(address _owner, address _strategy) Ownable(_owner) {
        require(_strategy != address(0), "Invalid strategy");
        strategy = IExecutionStrategy(_strategy);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function configure(bytes calldata _config, uint256 _interval) external onlyOwner {
        strategy.validateConfig(_config);
        config = _config;
        interval = _interval;
        emit Configured(_config, _interval);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(address(this).balance >= amount, "Insufficient balance");
        payable(owner()).transfer(amount);
        emit Withdrawn(owner(), amount);
    }

    function scheduleNextRun() public onlyOwner returns (address scheduleAddress) {
        return _scheduleNextRun();
    }

    function _scheduleNextRun() internal returns (address scheduleAddress) {
        require(interval > 0, "Vault not configured");
        bytes memory callData = abi.encodeWithSelector(ScheduledVault.executeScheduled.selector);
        uint256 expiryTimestamp = block.timestamp + interval;

        (int64 responseCode, address sched) = IHederaScheduleService(HEDERA_SCHEDULE_SERVICE).scheduleCall(
            address(this),
            expiryTimestamp,
            500000,
            0,
            callData
        );
        require(responseCode == 22 || responseCode == 0, "Schedule call failed");
        lastScheduleAddress = sched;
        emit Scheduled(sched);
        return sched;
    }

    function executeScheduled() external nonReentrant {
        emit Executed(block.timestamp);

        if (config.length > 0) {
            IExecutionStrategy.Action[] memory actions = strategy.plan(config);
            for (uint256 i = 0; i < actions.length; i++) {
                (bool success, ) = payable(actions[i].target).call{value: actions[i].value}(actions[i].data);
                require(success, "Execution strategy action failed");
            }
        }

        if (interval > 0) {
            _scheduleNextRun();
        }
    }
}
