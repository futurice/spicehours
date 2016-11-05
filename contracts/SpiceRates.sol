pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "IBalanceConverter.sol";

contract SpiceRates is SpiceControlled, IBalanceConverter {
    uint public hourlyRate;
    uint public maxHours;
    mapping(bytes32 => uint8) public unpaidPercentage;

    function SpiceRates(
        address _members,
        uint _hourlyRate,
        uint _maxHours
    ) SpiceControlled(_members) {
        hourlyRate = _hourlyRate;
        maxHours = _maxHours;
    }

    function setHourlyRate(uint _hourlyRate) onlyDirector {
        hourlyRate = _hourlyRate;
    }

    function setMaxHours(uint _maxHours) onlyDirector {
        maxHours = _maxHours;
    }

    function setUnpaidPercentage(bytes32 _info, uint8 _percentage) onlyMember {
        if (!hasManagerAccess(msg.sender) && members.memberInfo(msg.sender) != _info) throw;
        if (_percentage > 100) throw;
        if (_info == 0) throw;

        unpaidPercentage[_info] = _percentage;
    }

    function convertBalance(bytes32 _info, uint balance) returns (uint) {
        if (balance > maxHours) {
            balance = maxHours;
        }
        return (balance * hourlyRate * (100 - unpaidPercentage[_info])) / 100;
    }
}
