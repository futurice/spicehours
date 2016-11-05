function getTransaction(func) {
  return Promise.resolve().then(func)
    .then(function(txid) {
      return new Promise(function(resolve, reject) {
        web3.eth.getTransaction(txid, function(err, tx) {
          if (err) return reject(err);
          web3.eth.getTransactionReceipt(txid, function(err, txr) {
            if (err) return reject(err);
            resolve([tx, txr]);
          });
        });
      }).then(function(txdata) {
       var tx = txdata[0];
       var txr = txdata[1];
       if (txr.gasUsed === tx.gas) throw new Error("all gas used");
        return txid;
      });
    });
}

function getTransactionError(func) {
  return getTransaction(func)
    .then(
      function(txid) { return; },
      function(err) { return err; }
    );
}

exports.getTransaction = getTransaction;
exports.getTransactionError = getTransactionError;
