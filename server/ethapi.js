const express = require('express');
const eth = require('./eth');

const router = express.Router();
const web3 = eth.web3;

router.get('/block/:hash', (req, res, next) => {
  const hash = req.params.hash;
  web3.eth.getBlock(hash, (err, block) => {
    if (err) return next(err);
    res.json(block);
  });
});

router.get('/tx/:hash', (req, res, next) => {
  const hash = req.params.hash;

  web3.eth.getTransaction(hash, (err, tx) => {
    if (err) return next(err);
    res.json(tx);
  });
});

router.get('/txreceipt/:hash', (req, res, next) => {
  const timeout = 240000;
  const hash = req.params.hash;
  const start = new Date().getTime();

  function checkReceipt() {
    web3.eth.getTransactionReceipt(hash, (err, receipt) => {
      if (err) return next(err);
      if (receipt) return res.json(receipt);

      if (timeout > 0 && new Date().getTime() - start > timeout) {
        return res.status(404).json({ error: `Transaction ${hash} wasn't processed in ${timeout / 1000} seconds`});
      }

      setTimeout(checkReceipt, 1000);
    });
  }
  checkReceipt();
});

module.exports = router;
