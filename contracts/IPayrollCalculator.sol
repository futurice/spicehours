pragma solidity ^0.4.2;

contract IPayrollCalculator {
    function calculatePaidDuration(bytes32 _info, uint _duration) returns (uint);
    function calculatePayout(bytes32 _info, uint _duration) returns (uint);
}
