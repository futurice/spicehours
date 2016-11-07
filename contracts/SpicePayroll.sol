pragma solidity ^0.4.2;

import "IBalanceConverter.sol";

contract SpicePayroll {
    struct PayrollLine {
        bytes32 info;
        uint balance;
    }

    address owner;
    address public handler;
    IBalanceConverter public balanceConverter;

    uint public fromTimestamp;
    uint public untilTimestamp;

    PayrollLine[] lines;

    event ProcessLine(address indexed _handler, bytes32 indexed _info, uint input, uint output);

    modifier onlyOwner {
        if (msg.sender != owner) throw;
        _;
    }

    function SpicePayroll(address _handler, address _balanceConverter, uint _fromTimestamp) {
        owner = msg.sender;
        handler = _handler;
        balanceConverter = IBalanceConverter(_balanceConverter);

        fromTimestamp = _fromTimestamp;
        untilTimestamp = now;
    }

    function processLine(bytes32 _info, uint _input) onlyOwner {
        uint output = balanceConverter.convertBalance(_info, _input);
        lines[lines.length++] = PayrollLine(_info, output);
        ProcessLine(handler, _info, _input, output);
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
