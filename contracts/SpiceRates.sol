pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "IPayoutCalculator.sol";

contract SpiceRates is SpiceControlled, IPayoutCalculator {
    struct RatesEntry {
        bool available;
        uint8 unpaidPercentage;
    }

    uint public hourlyRate;
    mapping(bytes32 => RatesEntry) entries;
    bytes32[] infos;

    event SetHourlyRate(uint hourlyRate);
    event SetUnpaidPercentage(bytes32 indexed info, uint8 unpaidPercentage);
    event CalculatePayout(bytes32 indexed info, uint duration, uint hourlyRate, uint8 unpaidPercentage);

    function SpiceRates(
        address _members,
        uint _hourlyRate
    ) SpiceControlled(_members) {
        hourlyRate = _hourlyRate;
        SetHourlyRate(hourlyRate);
    }

    function setHourlyRate(uint _hourlyRate) onlyDirector {
        hourlyRate = _hourlyRate;
    }

    function setUnpaidPercentage(bytes32 _info, uint8 _percentage) onlyManager {
        if (_percentage > 100) throw;
        if (_info == 0) throw;

        RatesEntry entry = entries[_info];
        if (!entry.available) {
            entry.available = true;
            infos.push(_info);
        }
        entry.unpaidPercentage = _percentage;
        SetUnpaidPercentage(_info, _percentage);
    }

    function unpaidPercentage(bytes32 _info) constant returns (uint8) {
        return entries[_info].unpaidPercentage;
    }

    function entryInfo(uint _index) constant returns (bytes32) {
        return infos[_index];
    }

    function entryCount() constant returns (uint) {
        return infos.length;
    }

    // This is the main function implementing IPayoutCalculator
    function calculatePayout(bytes32 _info, uint _duration) returns (uint) {
        uint8 unpaid = unpaidPercentage(_info);
        CalculatePayout(_info, _duration, hourlyRate, unpaid);

        uint fullTimeOutput = _duration * hourlyRate / 3600;
        return (fullTimeOutput * (100 - unpaid)) / 100;
    }
}
