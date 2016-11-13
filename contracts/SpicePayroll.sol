pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "IPayrollCalculator.sol";

contract SpicePayroll is SpiceControlled {
    struct PayrollLine {
        bytes32 info;
        uint duration;
        uint payout;
    }

    bool locked;
    address creator;
    address public handler;
    IPayrollCalculator public calculator;

    uint public fromTimestamp;
    uint public untilTimestamp;

    PayrollLine[] lines;

    event NewPayroll(address indexed handler, address indexed calculator, uint from, uint until);
    event ProcessLine(bytes32 indexed info, uint input, uint duration, uint payout);
    event ModifyLine(address indexed sender, bytes32 indexed info, uint duration, uint payout);

    modifier onlyCreator {
        if (msg.sender != creator) throw;
        _;
    }
    modifier onlyUnlocked {
        if (locked) throw;
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

    function processLine(bytes32 _info, uint _input) onlyCreator onlyUnlocked {
        uint duration = calculator.calculatePaidDuration(_info, _input);
        uint payout = calculator.calculatePayout(_info, duration);
        lines[lines.length++] = PayrollLine(_info, duration, payout);
        ProcessLine(_info, _input, duration, payout);
    }

    function modifyLine(uint _index, uint _duration) onlyDirector onlyUnlocked {
        bytes32 info = lines[_index].info;
        uint payout = calculator.calculatePayout(info, _duration);

        lines[_index] = PayrollLine(info, _duration, payout);
        ModifyLine(msg.sender, info, _duration, payout);
    }

    function lock() onlyDirector {
        locked = true;
    }

    function unlock() onlyOwner {
        locked = false;
    }

    function lineInfo(uint _index) constant returns (bytes32) {
        return lines[_index].info;
    }

    function lineDuration(uint _index) constant returns (uint) {
        return lines[_index].duration;
    }

    function linePayout(uint _index) constant returns (uint) {
        return lines[_index].payout;
    }

    function lineCount() constant returns (uint) {
        return lines.length;
    }
}
