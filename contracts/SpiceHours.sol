pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "SpicePayroll.sol";

contract SpiceHours is SpiceControlled {
    address[] public payrolls;

    event MarkHours(bytes32 indexed info, bytes32 indexed description, int duration, bool success);
    event ProcessPayroll(address indexed payroll, uint maxDuration);

    function SpiceHours(address _members) SpiceControlled(_members) {
        payrolls[payrolls.length++] = new SpicePayroll(members);
    }

    function markHours(bytes32 _info, bytes32 _description, int _duration) onlyMember {
        if (!hasManagerAccess(msg.sender) && members.memberInfo(msg.sender) != _info) throw;

        SpicePayroll payroll = SpicePayroll(payrolls[payrolls.length-1]);
        bool success = payroll.addMarking(_info, _description, _duration);
        MarkHours(_info, _description, _duration, success);
    }

    function processPayroll(address _calculator, uint _maxDuration) onlyDirector {
        SpicePayroll payroll = SpicePayroll(payrolls[payrolls.length-1]);
        payroll.processMarkings(_calculator, _maxDuration);
        ProcessPayroll(payroll, _maxDuration);

        payrolls[payrolls.length++] = new SpicePayroll(members);
    }

    function currentPayroll() constant returns (address) {
        return payrolls[payrolls.length-1];
    }

    function payrollCount() constant returns (uint) {
        return payrolls.length;
    }
}
