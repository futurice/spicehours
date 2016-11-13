pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "IPayrollCalculator.sol";

contract SpicePayroll is SpiceControlled {
    struct PayrollLine {
        bytes32 info;
        uint payout;
    }

    address creator;
    address public handler;
    IPayrollCalculator public calculator;

    uint public fromTimestamp;
    uint public untilTimestamp;

    PayrollLine[] lines;

    event NewPayroll(address indexed handler, address indexed calculator, uint from, uint until);
    event ProcessLine(bytes32 indexed info, uint input, uint duration, uint payout);
    event ModifyPayout(address indexed sender, bytes32 indexed info, uint payout);

    modifier onlyCreator {
        if (msg.sender != creator) throw;
        _;
    }

    function SpicePayroll(address _members, address _handler, address _calculator, uint _fromTimestamp) SpiceControlled(_members) {
        creator = msg.sender;

        handler = _handler;
        calculator = IPayrollCalculator(_calculator);
        fromTimestamp = _fromTimestamp;
        untilTimestamp = now;

        NewPayroll(handler, calculator, fromTimestamp, untilTimestamp);
    }

    function processLine(bytes32 _info, uint _duration) onlyCreator {
        uint paidDuration = calculator.calculatePaidDuration(_info, _duration);
        uint payout = calculator.calculatePayout(_info, paidDuration);
        lines[lines.length++] = PayrollLine(_info, payout);
        ProcessLine(_info, _duration, paidDuration, payout);
    }

    function setLinePayout(uint _index, uint _payout) onlyDirector {
        lines[_index].payout = _payout;
        ModifyPayout(msg.sender, lineInfo(_index), _payout);
    }

    function lineInfo(uint _index) constant returns (bytes32) {
        return lines[_index].info;
    }

    function linePayout(uint _index) constant returns (uint) {
        return lines[_index].payout;
    }

    function lineCount() constant returns (uint) {
        return lines.length;
    }
}
