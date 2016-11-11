pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "SpicePayroll.sol";

contract SpiceHours is SpiceControlled {
    struct MemberBalance {
        bool available;
        uint total;
    }

    uint public fromTimestamp;
    address[] payrolls;

    mapping (bytes32 => MemberBalance) balances;
    bytes32[] infos;
    uint infoCount;

    event MarkHours(address indexed sender, bytes32 indexed info, bytes32 indexed description, int duration);
    event FixHours(address indexed sender, bytes32 indexed info, bytes32 indexed description, int duration);
    event Payroll(address indexed sender, address indexed converter, address payroll);

    function SpiceHours(address _members) SpiceControlled(_members) {
        fromTimestamp = now;
    }

    function payroll(uint _index) constant returns (address) {
        return payrolls[_index];
    }

    function payrollCount() constant returns (uint) {
        return payrolls.length;
    }

    function balance(bytes32 _info) constant returns (uint) {
        return balances[_info].total;
    }

    function adjustHours(bytes32 _info, int _duration) private {
        if (_info == 0) throw;
        if (_duration == 0) throw;
        if (_duration < 0 && balances[_info].total < uint(-_duration)) throw;

        if (!balances[_info].available) {
            balances[_info].available = true;
            infos.push(_info);
            infoCount++;
        }

        if (_duration < 0) {
            balances[_info].total -= uint(-_duration);
        } else {
            balances[_info].total += uint(_duration);
        }
    }

    function markHours(bytes32 _info, bytes32 _description, int _duration) onlyMember {
        if (!hasManagerAccess(msg.sender) && members.memberInfo(msg.sender) != _info) throw;

        adjustHours(_info, _duration);
        MarkHours(msg.sender, _info, _description, _duration);
    }

    function fixHours(bytes32 _info, bytes32 _description, int _duration) onlyDirector {
        adjustHours(_info, _duration);
        FixHours(msg.sender, _info, _description, _duration);
    }

    function processPayroll(address _balanceConverter) onlyDirector {
        SpicePayroll payroll = new SpicePayroll(msg.sender, _balanceConverter, fromTimestamp);
        Payroll(msg.sender, _balanceConverter, payroll);

        for (uint i = 0; i < infoCount; i++) {
            payroll.processLine(infos[i], balances[infos[i]].total);
            delete balances[infos[i]];
        }
        delete infos;

        payrolls.push(payroll);
        fromTimestamp = now;
    }
}
