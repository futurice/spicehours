pragma solidity ^0.4.2;

import "SpiceControlled.sol";
import "SpicePayroll.sol";

contract SpiceHours is SpiceControlled {
    function SpiceHours(address membersAddress) SpiceControlled(membersAddress) {
    }

    function test() onlyOwner {
    }
}
