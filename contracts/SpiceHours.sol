pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "IBalanceConverter.sol";
import "SpicePayroll.sol";

contract SpiceHours is SpiceControlled {
    mapping (bytes32 => uint) public balance;
    uint public fromTimestamp;

    event MarkHours(address indexed _sender, bytes32 indexed _info, bytes32 indexed _description, int _secs);
    event FixHours(address indexed _sender, bytes32 indexed _info, bytes32 indexed _description, int _secs);

    function SpiceHours(address _members) SpiceControlled(_members) {
        fromTimestamp = now;
    }

    function adjustHours(bytes32 _info, int _secs) private {
        if (_info == 0) throw;
        if (_secs == 0) throw;
        if (_secs < 0 && balance[_info] < uint(-_secs)) throw;

        if (_secs < 0) {
            balance[_info] -= uint(-_secs);
        } else {
            balance[_info] += uint(_secs);
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
    }
}
