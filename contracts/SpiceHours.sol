pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "SpicePayroll.sol";

contract SpiceHours is SpiceControlled {
    mapping (bytes32 => uint) public balance;
    uint public fromTimestamp;

    event MarkHours(address indexed _sender, bytes32 indexed _info, bytes32 indexed _description, int _secs);
    event FixHours(address indexed _sender, bytes32 indexed _info, bytes32 indexed _description, int _secs);

    function SpiceHours(address membersAddress) SpiceControlled(membersAddress) {
        fromTimestamp = now;
    }

    function adjustHours(bytes32 info, int secs) private {
        if (info == 0) throw;
        if (secs == 0) throw;
        if (secs < 0 && balance[info] < uint(-secs)) throw;

        if (secs < 0) {
            balance[info] -= uint(-secs);
        } else {
            balance[info] += uint(secs);
        }
    }

    function markHours(bytes32 info, bytes32 description, int secs) onlyMember {
        if (!hasManagerAccess(msg.sender) && members.memberInfo(msg.sender) != info) throw;

        adjustHours(info, secs);
        MarkHours(msg.sender, info, description, secs);
    }

    function fixHours(bytes32 info, bytes32 description, int secs) onlyDirector {
        adjustHours(info, secs);
        FixHours(msg.sender, info, description, secs);
    }

    function processPayroll(address balanceConverter) onlyDirector {
        SpicePayroll payroll = new SpicePayroll(msg.sender, fromTimestamp);
    }
}
