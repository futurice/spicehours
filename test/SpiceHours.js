var NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

function getTransactionError(func) {
  return Promise.resolve().then(func)
    .then(function(txid) {
      var tx = web3.eth.getTransaction(txid);
      var txr = web3.eth.getTransactionReceipt(txid);
      if (txr.gasUsed === tx.gas) throw new Error("all gas used");
    })
    .catch(function(err) {
      return err;
    });
}

contract("SpiceHours", function(accounts) {

  describe("test", function() {

    it("should not throw an error for owner", function() {
      var contract = SpiceHours.deployed();
      return getTransactionError(function() {
        return contract.test();
      }).then(function(err) {
        assert.isUndefined(err, "owner should have access");
      });
    });

    it("should throw an error for others", function() {
      var contract = SpiceHours.deployed();
      return getTransactionError(function() {
        return contract.test({from: accounts[1]});
      }).then(function(err) {
        assert.isDefined(err, "others should not have access");
      });
    });
  });
});
