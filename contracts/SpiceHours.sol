pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "SpicePayroll.sol";

contract SpiceHours is SpiceControlled {
    struct MemberBalance {
        bool available;
        uint duration;
    }

    uint public fromTimestamp;
    address[] public payrolls;

    mapping (bytes32 => MemberBalance) public balances;
    bytes32[] public infos;

    event MarkHours(address indexed sender, bytes32 indexed info, bytes32 indexed description, int duration);
    event FixHours(address indexed sender, bytes32 indexed info, bytes32 indexed description, int duration);
    event ProcessHours(address indexed sender, address indexed payroll, bytes32 indexed info, uint duration);
    event ProcessPayroll(address indexed sender, address indexed payroll);

    function SpiceHours(address _members) SpiceControlled(_members) {
        fromTimestamp = now;
    }

    function markHours(bytes32 _info, bytes32 _description, int _duration) onlyMember {
        if (!hasManagerAccess(msg.sender) && members.memberInfo(msg.sender) != _info) throw;
        if (_duration < 0 && balances[_info].duration < uint(-_duration)) throw;
        if (_duration == 0) throw;
        if (_info == 0) throw;

        // If not avalable, add to infos to make interable
        if (!balances[_info].available) {
            balances[_info].available = true;
            infos.push(_info);
        }

        if (_duration < 0) {
            balances[_info].duration -= uint(-_duration);
        } else {
            balances[_info].duration += uint(_duration);
        }
        MarkHours(msg.sender, _info, _description, _duration);
    }

    function processPayroll(address _balanceConverter) onlyDirector {
        SpicePayroll payroll = new SpicePayroll(members, msg.sender, _balanceConverter, fromTimestamp);

        for (uint i = 0; i < infos.length; i++) {
            payroll.processLine(infos[i], balances[infos[i]].duration);
            ProcessHours(msg.sender, payroll, infos[i], balances[infos[i]].duration);
            delete balances[infos[i]];
        }
        delete infos;

        ProcessPayroll(msg.sender, payroll);
        payrolls.push(payroll);
        fromTimestamp = now;
    }

    function balance(bytes32 _info) constant returns (uint) {
        return balances[_info].duration;
    }

    function payrollCount() constant returns (uint) {
        return payrolls.length;
    }

    function infoCount() constant returns (uint) {
        return infos.length;
    }
}
