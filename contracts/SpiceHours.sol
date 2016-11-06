pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "IBalanceConverter.sol";
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

    event MarkHours(address indexed _sender, bytes32 indexed _info, bytes32 indexed _description, int _secs);
    event FixHours(address indexed _sender, bytes32 indexed _info, bytes32 indexed _description, int _secs);
    event PayrollLine(address indexed _sender, bytes32 indexed _info, uint secs, uint balance);
    event Payroll(address indexed _sender, address _payroll);

    function SpiceHours(address _members) SpiceControlled(_members) {
        fromTimestamp = now;
    }

    function balance(bytes32 _info) returns (uint) {
        return balances[_info].total;
    }

    function adjustHours(bytes32 _info, int _secs) private {
        if (_info == 0) throw;
        if (_secs == 0) throw;
        if (_secs < 0 && balances[_info].total < uint(-_secs)) throw;

        if (!balances[_info].available) {
            balances[_info].available = true;
            infos.push(_info);
            infoCount++;
        }

        if (_secs < 0) {
            balances[_info].total -= uint(-_secs);
        } else {
            balances[_info].total += uint(_secs);
        }
    }

    function markHours(bytes32 _info, bytes32 _description, int _secs) onlyMember {
        if (!hasManagerAccess(msg.sender) && members.memberInfo(msg.sender) != _info) throw;

        adjustHours(_info, _secs);
        MarkHours(msg.sender, _info, _description, _secs);
    }

    function fixHours(bytes32 _info, bytes32 _description, int _secs) onlyDirector {
        adjustHours(_info, _secs);
        FixHours(msg.sender, _info, _description, _secs);
    }

    function processPayroll(address _balanceConverter) onlyDirector {
        IBalanceConverter converter = IBalanceConverter(_balanceConverter);
        SpicePayroll payroll = new SpicePayroll(msg.sender, fromTimestamp);
        for (uint i = 0; i < infoCount; i++) {
            uint secs = balances[infos[i]].total;
            delete balances[infos[i]];

            uint balance = converter.convertBalance(infos[i], secs);
            PayrollLine(msg.sender, infos[i], secs, balance);
            payroll.addLine(infos[i], balance);
        }
        delete infos;

        Payroll(msg.sender, payroll);
        payrolls.push(payroll);
        fromTimestamp = now;
    }

    function payroll(uint _index) returns (address) {
        return payrolls[_index];
    }

    function payrollCount() returns (uint) {
        return payrolls.length;
    }
}
