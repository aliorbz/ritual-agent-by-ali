// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SchedulerProbe {
    address public constant SCHEDULER =
        0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B;

    address public owner;
    uint256 public lastCallId;
    uint256 public wakeCount;
    uint256 public lastExecutionIndex;
    uint256 public lastWakeBlock;
    address public lastSender;
    address public lastOrigin;

    event SchedulerApproved(address indexed scheduler);
    event ProbeScheduled(
        uint256 indexed callId,
        uint32 startBlock,
        uint32 numCalls,
        uint32 frequency,
        uint32 ttl
    );
    event ProbeWake(
        uint256 indexed executionIndex,
        uint256 wakeCount,
        uint256 blockNumber,
        address sender,
        address origin
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Some Ritual docs mention this approval step. If the factory harness ABI
    // expects this selector, this probe exposes it and records the call.
    function approveScheduler(address scheduler) external onlyOwner {
        require(scheduler == SCHEDULER, "bad scheduler");
        emit SchedulerApproved(scheduler);
    }

    function schedulePing(
        uint32 startDelay,
        uint32 numCalls,
        uint32 frequency,
        uint32 ttl
    ) external onlyOwner returns (uint256 callId) {
        bytes memory data = abi.encodeWithSelector(
            this.ping.selector,
            uint256(0)
        );

        uint32 startBlock = uint32(block.number) + startDelay;

        (bool ok, bytes memory result) = SCHEDULER.call(
            abi.encodeWithSignature(
                "schedule(bytes,uint32,uint32,uint32,uint32,uint32,uint256,uint256,uint256,address)",
                data,
                uint32(500_000),
                startBlock,
                numCalls,
                frequency,
                ttl,
                uint256(20 gwei),
                uint256(1 gwei),
                uint256(0),
                address(this)
            )
        );
        require(ok, "schedule failed");

        if (result.length >= 32) {
            callId = abi.decode(result, (uint256));
        }

        lastCallId = callId;
        emit ProbeScheduled(callId, startBlock, numCalls, frequency, ttl);
    }

    function ping(uint256 executionIndex) external {
        require(msg.sender == SCHEDULER, "only scheduler");

        wakeCount += 1;
        lastExecutionIndex = executionIndex;
        lastWakeBlock = block.number;
        lastSender = msg.sender;
        lastOrigin = tx.origin;

        emit ProbeWake(
            executionIndex,
            wakeCount,
            block.number,
            msg.sender,
            tx.origin
        );
    }
}
