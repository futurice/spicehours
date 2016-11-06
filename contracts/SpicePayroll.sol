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

    function SpicePayroll(address _handler, uint _fromTimestamp) {
        owner = msg.sender;
        handler = _handler;
        fromTimestamp = _fromTimestamp;
        untilTimestamp = now;
    }

    function addLine(bytes32 _info, uint _balance) onlyOwner {
        lines[lines.length++] = PayrollLine(_info, _balance);
    }

    function lineInfo(uint _index) constant returns (bytes32) {
        return lines[_index].info;
    }

    function lineBalance(uint _index) constant returns (uint) {
        return lines[_index].balance;
    }

    function lineCount() constant returns (uint) {
        return lines.length;
    }
}
