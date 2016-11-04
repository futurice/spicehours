pragma solidity ^0.4.2;

import "SpiceMembers.sol";

contract SpiceControlled {
    SpiceMembers members;

    modifier onlyOwner {
        if (msg.sender != members.owner()) throw;
        _;
    }

    modifier onlyDirector {
        if (msg.sender != members.owner() && members.memberLevel(msg.sender) < SpiceMembers.MemberLevel.Director) throw;
        _;
    }

    modifier onlyManager {
        if (msg.sender != members.owner() && members.memberLevel(msg.sender) < SpiceMembers.MemberLevel.Manager) throw;
        _;
    }

    modifier onlyMember {
        if (msg.sender != members.owner() && members.memberLevel(msg.sender) < SpiceMembers.MemberLevel.Member) throw;
        _;
    }

    function SpiceControlled(address membersAddress) {
        members = SpiceMembers(membersAddress);
    }
}
