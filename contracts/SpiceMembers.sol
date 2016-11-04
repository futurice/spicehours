pragma solidity ^0.4.2;

contract SpiceMembers {
    enum MemberLevel { None, Member, Manager, Director }
    struct Member {
        uint id;
        MemberLevel level;
        bytes32 info;
    }

    mapping (address => Member) member;

    address public owner;
    mapping (uint => address) public memberAddress;
    uint public memberCount;

    event TransferOwnership(address sender, address owner);
    event AddMember(address sender, address member);
    event RemoveMember(address sender, address member);
    event SetMemberLevel(address sender, address member, MemberLevel level);
    event SetMemberInfo(address sender, address member, bytes32 info);

    function SpiceMembers() {
        owner = msg.sender;

        memberCount = 1;
        memberAddress[memberCount] = owner;
        member[owner] = Member(memberCount, MemberLevel.None, 0);
    }

    modifier onlyOwner {
        if (msg.sender != owner) throw;
        _;
    }

    modifier onlyManager {
        if (msg.sender != owner && memberLevel(msg.sender) < MemberLevel.Manager) throw;
        _;
    }

    function transferOwnership(address target) onlyOwner {
        // If new owner has no memberId, create one
        if (member[target].id == 0) {
            memberCount++;
            memberAddress[memberCount] = target;
            member[target] = Member(memberCount, MemberLevel.None, 0);
        }
        owner = target;
        TransferOwnership(msg.sender, owner);
    }

    function addMember(address target) onlyManager {
        // Make sure trying to add an existing member throws an error
        if (memberLevel(target) != MemberLevel.None) throw;

        // If added member has no memberId, create one
        if (member[target].id == 0) {
            memberCount++;
            memberAddress[memberCount] = target;
            member[target] = Member(memberCount, MemberLevel.Member, 0);
        } else {
            // Set memberLevel to initial value with basic access
            member[target].level = MemberLevel.Member;
        }
        AddMember(msg.sender, target);
    }

    function removeMember(address target) {
        // Make sure trying to remove a non-existing member throws an error
        if (memberLevel(target) == MemberLevel.None) throw;
        // Make sure members are only allowed to delete members lower than their level
        if (msg.sender != owner && memberLevel(msg.sender) <= memberLevel(target)) throw;

        member[target].level = MemberLevel.None;
        RemoveMember(msg.sender, target);
    }

    function setMemberLevel(address target, MemberLevel level) {
        // Make sure all levels are larger than None but not higher than Director
        if (level == MemberLevel.None || level > MemberLevel.Director) throw;
        // Make sure the target is currently already a member
        if (memberLevel(target) == MemberLevel.None) throw;
        // Make sure the new level is lower level than we are (we cannot overpromote)
        if (msg.sender != owner && memberLevel(msg.sender) <= level) throw;
        // Make sure the member is currently on lower level than we are
        if (msg.sender != owner && memberLevel(msg.sender) <= memberLevel(target)) throw;

        member[target].level = level;
        SetMemberLevel(msg.sender, target, level);
    }

    function setMemberInfo(address target, bytes32 info) {
        // Make sure the target is currently already a member
        if (memberLevel(target) == MemberLevel.None) throw;
        // Make sure the member is currently on lower level than we are
        if (msg.sender != owner && msg.sender != target && memberLevel(msg.sender) <= memberLevel(target)) throw;

        member[target].info = info;
        SetMemberInfo(msg.sender, target, info);
    }

    function memberId(address target) returns (uint) {
        return member[target].id;
    }

    function memberLevel(address target) returns (MemberLevel) {
        return member[target].level;
    }

    function memberInfo(address target) returns (bytes32) {
        return member[target].info;
    }
}
