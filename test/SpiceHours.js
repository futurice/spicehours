var utils = require('./utils');

var NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
var getTransactionError = utils.getTransactionError;

contract("SpiceHours", function(accounts) {

  describe("balance", function() {

    it("should be zero in the beginning", function() {
      var contract = SpiceHours.deployed();
      return contract.balance.call(accounts[0]).then(function(balance) {
        assert.equal(balance.valueOf(), 0, "balance should be zero");
      });
    });
  });
});
