pragma solidity ^0.4.2;

import "SpiceMembers.sol";

contract SpiceControlled {
    SpiceMembers members;

    modifier onlyOwner {
        if (!hasOwnerAccess(msg.sender)) throw;
        _;
    }

    modifier onlyDirector {
        if (!hasDirectorAccess(msg.sender)) throw;
        _;
    }

    modifier onlyManager {
        if (!hasManagerAccess(msg.sender)) throw;
        _;
    }

    modifier onlyMember {
        if (!hasMemberAccess(msg.sender)) throw;
        _;
    }

    function SpiceControlled(address membersAddress) {
        members = SpiceMembers(membersAddress);
    }

    function hasOwnerAccess(address _target) internal returns (bool) {
        return (_target == members.owner());
    }

    function hasDirectorAccess(address _target) internal returns (bool) {
        return (members.memberLevel(_target) >= SpiceMembers.MemberLevel.Director || hasOwnerAccess(_target));
    }

    function hasManagerAccess(address _target) internal returns (bool) {
        return (members.memberLevel(_target) >= SpiceMembers.MemberLevel.Manager || hasOwnerAccess(_target));
    }

    function hasMemberAccess(address _target) internal returns (bool) {
        return (members.memberLevel(_target) >= SpiceMembers.MemberLevel.Member || hasOwnerAccess(_target));
    }
}
