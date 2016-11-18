var utils = require('./utils');

var NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
var getTransactionError = utils.getTransactionError;

contract("SpiceHours", function(accounts) {

  describe("balance", function() {

    it("should be zero in the beginning", function() {
      const contract = SpiceHours.deployed();
      return contract.currentPayroll(payrollAddress => {
        const payroll = SpicePayroll.at(payrollAddress);
        payroll.balance(accounts[0]).then(balance => {
          assert.equal(balance.toString(), "0", "balance should be zero");
        });
      });
    });
  });
});
