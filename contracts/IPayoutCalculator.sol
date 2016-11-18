pragma solidity ^0.4.2;

contract IPayoutCalculator {
    function calculatePayout(bytes32 _info, uint _duration) returns (uint);
}
