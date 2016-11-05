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

  describe("balance", function() {

    it("should be zero in the beginning", function() {
      var contract = SpiceHours.deployed();
      return contract.balance.call(accounts[0]).then(function(balance) {
        assert.equal(balance.valueOf(), 0, "balance should be zero");
      });
    });
  });
});
