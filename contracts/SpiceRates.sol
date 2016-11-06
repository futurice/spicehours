pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "IBalanceConverter.sol";

contract SpiceRates is SpiceControlled, IBalanceConverter {
    uint public maxTime;
    uint public hourlyRate;
    mapping(bytes32 => uint8) public unpaidPercentage;

    function SpiceRates(
        address _members,
        uint _maxTime,
        uint _hourlyRate
    ) SpiceControlled(_members) {
        maxTime = _maxTime;
        hourlyRate = _hourlyRate;
    }

    function setHourlyRate(uint _hourlyRate) onlyDirector {
        hourlyRate = _hourlyRate;
    }

    function setMaxTime(uint _maxTime) onlyDirector {
        maxTime = _maxTime;
    }

    function setUnpaidPercentage(bytes32 _info, uint8 _percentage) onlyMember {
        if (!hasManagerAccess(msg.sender) && members.memberInfo(msg.sender) != _info) throw;
        if (_percentage > 100) throw;
        if (_info == 0) throw;

        unpaidPercentage[_info] = _percentage;
    }

    function convertBalance(bytes32 _info, uint _input) returns (uint) {
        if (_input > maxTime) {
            _input = maxTime;
        }

        uint fullTimeOutput = _input * hourlyRate / 3600;
        return (fullTimeOutput * (100 - unpaidPercentage[_info])) / 100;
    }
}
