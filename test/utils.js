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

exports.getTransactionError = getTransactionError;
