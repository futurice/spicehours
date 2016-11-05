pragma solidity ^0.4.2;

contract SpicePayroll {
    struct PayrollLine {
        bytes32 info;
        uint balance;
    }

    address owner;

    address public handler;
    uint public fromTimestamp;
    uint public untilTimestamp;

    PayrollLine[] lines;

    modifier onlyOwner {
        if (msg.sender != owner) throw;
        _;
    }

    function SpicePayroll(address handlerAddress, uint from) {
        owner = msg.sender;
        handler = handlerAddress;
        fromTimestamp = from;
        untilTimestamp = now;
    }

    function addLine(bytes32 info, uint balance) onlyOwner {
        lines[lines.length++] = PayrollLine(info, balance);
    }

    function getLineInfo(uint index) returns (bytes32) {
        return lines[index].info;
    }

    function getLineBalance(uint index) returns (uint) {
        return lines[index].balance;
    }

    function getLineCount() returns (uint) {
        return lines.length;
    }
}