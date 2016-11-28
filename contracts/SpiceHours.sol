pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "SpicePayroll.sol";

contract SpiceHours is SpiceControlled {
    address[] public payrolls;

    event MarkHours(bytes32 indexed info, bytes32 indexed description, int duration, bool success);
    event ProcessPayroll(address indexed payroll, uint maxDuration);
    event CreatePayroll(address indexed payroll);

    function SpiceHours(address _members) SpiceControlled(_members) {
        payrolls[payrolls.length++] = new SpicePayroll(members);
        CreatePayroll(payrolls[payrolls.length-1]);
    }

    function markHours(bytes32 _info, bytes32 _description, int _duration) onlyMember {
        if (!hasManagerAccess(msg.sender) && members.memberInfo(msg.sender) != _info) throw;
        if (_duration == 0) throw;
        if (_info == 0) throw;

        SpicePayroll payroll = SpicePayroll(payrolls[payrolls.length-1]);
        bool success = payroll.addMarking(_info, _description, _duration);
        MarkHours(_info, _description, _duration, success);
    }

    function markHours(bytes32 _description, int _duration) {
        markHours(members.memberInfo(msg.sender), _description, _duration);
    }

    function processPayroll(address _calculator, uint _maxDuration) onlyDirector {
        SpicePayroll payroll = SpicePayroll(payrolls[payrolls.length-1]);
        payroll.processMarkings(_calculator, _maxDuration);
        ProcessPayroll(payroll, _maxDuration);

        payrolls[payrolls.length++] = new SpicePayroll(members);
        CreatePayroll(payrolls[payrolls.length-1]);
    }

    function hasPayroll(address _address) constant returns (bool) {
        for (uint i; i < payrolls.length; i++) {
            if (payrolls[i] == _address) return true;
        }
        return false;
    }

    function payrollCount() constant returns (uint) {
        return payrolls.length;
    }
}
