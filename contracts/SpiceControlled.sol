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

    function hasOwnerAccess(address target) returns (bool) {
        return (target == members.owner());
    }

    function hasDirectorAccess(address target) returns (bool) {
        return (members.memberLevel(target) >= SpiceMembers.MemberLevel.Director || hasOwnerAccess(target));
    }

    function hasManagerAccess(address target) returns (bool) {
        return (members.memberLevel(target) >= SpiceMembers.MemberLevel.Manager || hasOwnerAccess(target));
    }

    function hasMemberAccess(address target) returns (bool) {
        return (members.memberLevel(target) >= SpiceMembers.MemberLevel.Member || hasOwnerAccess(target));
    }
}
