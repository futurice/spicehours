pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "IPayoutCalculator.sol";

contract SpicePayroll is SpiceControlled {
    struct PayrollEntry {
        bool available;
        uint duration;
        bool processed;
        uint payout;
    }

    address creator;

    uint public fromBlock;
    uint public toBlock;

    mapping (bytes32 => PayrollEntry) entries;
    bytes32[] infos;

    address calculator;
    bool public locked;

    event NewPayroll(address indexed creator);
    event FailedMarking(bytes32 indexed info, bytes32 indexed description, uint total, int duration);
    event AddMarking(bytes32 indexed info, bytes32 indexed description, int duration, uint total);
    event ProcessMarkings(bytes32 indexed info, uint total, uint duration, uint payout);
    event AllMarkingsProcessed(address indexed calculator, uint maxDuration, uint fromBlock, uint toBlock);

    event ModifyMarking(bytes32 indexed info, uint duration, uint payout);
    event SetPayrollLocked(bool locked);

    modifier onlyCreator {
        if (msg.sender != creator) throw;
        _;
    }

    modifier onlyUnprocessed {
        if (calculator != 0) throw;
        _;
    }

    modifier onlyProcessed {
        if (calculator == 0) throw;
        _;
    }

    modifier onlyUnlocked {
        if (locked) throw;
        _;
    }

    function SpicePayroll(address _members) SpiceControlled(_members) {
        creator = msg.sender;
        fromBlock = block.number;
        NewPayroll(msg.sender);
    }

    function addMarking(bytes32 _info, bytes32 _description, int _duration) onlyCreator onlyUnprocessed returns(bool) {
        // Check if the duration would become negative as a result of this marking
        // and if it does, mark this as failed and return false to indicate failure.
        if (_duration < 0 && entries[_info].duration < uint(-_duration)) {
          FailedMarking(_info, _description, entries[_info].duration, _duration);
          return false;
        }

        // If info not added yet, add it to the infos array
        PayrollEntry entry = entries[_info];
        if (!entry.available) {
            entry.available = true;
            infos.push(_info);
        }

        // Modify entry duration and send marking event
        if (_duration < 0) {
            entry.duration -= uint(-_duration);
        } else {
            entry.duration += uint(_duration);
        }
        AddMarking(_info, _description, _duration, entry.duration);
        return true;
    }

    function processMarkings(address _calculator, uint _maxDuration) onlyCreator onlyUnprocessed {
        calculator = _calculator;
        for (uint i = 0; i < infos.length; i++) {
            bytes32 info = infos[i];
            PayrollEntry entry = entries[info];

            uint originalDuration = entry.duration;
            entry.duration = (originalDuration <= _maxDuration) ? originalDuration : _maxDuration;
            entry.payout = IPayoutCalculator(calculator).calculatePayout(info, entry.duration);
            ProcessMarkings(info, originalDuration, entry.duration, entry.payout);
        }
        toBlock = block.number;
        AllMarkingsProcessed(_calculator, _maxDuration, fromBlock, toBlock);
    }

    function modifyMarking(bytes32 _info, uint _duration) onlyDirector onlyProcessed onlyUnlocked {
        if (!entries[_info].available) throw;

        PayrollEntry entry = entries[_info];
        entry.duration = _duration;
        entry.payout = IPayoutCalculator(calculator).calculatePayout(_info, _duration);
        ModifyMarking(_info, entry.duration, entry.payout);
    }

    function lock() onlyDirector {
        locked = true;
        SetPayrollLocked(locked);
    }

    function unlock() onlyOwner {
        locked = false;
        SetPayrollLocked(locked);
    }

    function processed() constant returns (bool) {
        return (calculator != 0);
    }

    function duration(bytes32 _info) constant returns (uint) {
        return entries[_info].duration;
    }

    function payout(bytes32 _info) constant returns (uint) {
        return entries[_info].payout;
    }

    function entryInfo(uint _index) constant returns (bytes32) {
        return infos[_index];
    }

    function entryCount() constant returns (uint) {
        return infos.length;
    }
}
