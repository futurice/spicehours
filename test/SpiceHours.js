var utils = require('./utils');

var NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
var getTransactionError = utils.getTransactionError;

contract("SpiceHours", function(accounts) {

  describe("duration", function() {

    it("should be zero in the beginning", function() {
      const contract = SpiceHours.deployed();
      return contract.payrollCount()
        .then(count => contract.payrolls(count.valueOf()-1))
        .then(payrollAddress => {
          const payroll = SpicePayroll.at(payrollAddress);
          payroll.duration(accounts[0]).then(balance => {
            assert.equal(balance.toString(), "0", "balance should be zero");
          });
        });
    });
  });
});
