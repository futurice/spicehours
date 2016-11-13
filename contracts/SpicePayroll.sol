pragma solidity ^0.4.2;

import "IPayrollCalculator.sol";

contract SpicePayroll {
    struct PayrollLine {
        bytes32 info;
        uint balance;
    }

    address owner;
    address public handler;
    IPayrollCalculator public calculator;

    uint public fromTimestamp;
    uint public untilTimestamp;

    PayrollLine[] lines;

    event ProcessLine(bytes32 indexed info, uint input, uint duration, uint payout);

    modifier onlyOwner {
        if (msg.sender != owner) throw;
        _;
    }

    function SpicePayroll(address _handler, address _calculator, uint _fromTimestamp) {
        owner = msg.sender;
        handler = _handler;
        calculator = IPayrollCalculator(_calculator);

        fromTimestamp = _fromTimestamp;
        untilTimestamp = now;
    }

    function processLine(bytes32 _info, uint _duration) onlyOwner {
        uint paidDuration = calculator.calculatePaidDuration(_info, _duration);
        uint payout = calculator.calculatePayout(_info, paidDuration);
        lines[lines.length++] = PayrollLine(_info, payout);
        ProcessLine(_info, _duration, paidDuration, payout);
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
