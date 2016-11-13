pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "IPayrollCalculator.sol";

contract SpiceRates is SpiceControlled, IPayrollCalculator {
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

    function setUnpaidPercentage(bytes32 _info, uint8 _percentage) onlyManager {
        if (_percentage > 100) throw;
        if (_info == 0) throw;

        unpaidPercentage[_info] = _percentage;
    }

    function calculatePaidDuration(bytes32 _info, uint _duration) returns (uint) {
        if (_duration > maxTime) {
            return maxTime;
        } else {
            return _duration;
        }
    }

    function calculatePayout(bytes32 _info, uint _duration) returns (uint) {
        uint fullTimeOutput = _duration * hourlyRate / 3600;
        return (fullTimeOutput * (100 - unpaidPercentage[_info])) / 100;
    }
}
