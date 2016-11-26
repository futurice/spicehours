const winston = require('winston');
const utils = require('./utils');
const web3 = require('./eth').web3;
const fum = require('./fum');

function getBlockPromise(blockHash) {
  if (!/^0x[0-9a-f]{64}$/.test(blockHash)) {
    return Promise.reject(new Error(`Invalid block hash ${blockHash}`));
  }

  return new Promise((resolve, reject) => {
    web3.eth.getBlock(blockHash, false, false, (err, block) => {
      if (err) return reject(err);
      resolve(block);
    });
  });
}

function processEvent(event) {
  if (!event) return Promise.resolve();

  return Promise.resolve()
    .then(() => {
      if (!event.blockHash) return Promise.resolve();

      return getBlockPromise(event.blockHash)
        .then(block => event.block = block)
        .catch(err => winston.warn(`${err.message}\n${err.stackTrace}`));
    })
    .then(() => {
      if (!event.args) return Promise.resolve();

      event.args.description = utils.bytes32ToStr(event.args.description);
      event.args.info = (event.args.info ? utils.decryptInfo(event.args.info) : null);

      if (event.args.info) {
        if (!/^[0-9a-z]+$/.test(event.args.info)) {
          winston.warn(`Invalid user after decryption: ${event.args.info}`);
          return Promise.resolve();
        }

        return fum.getUser(event.args.info)
          .then(user => event.user = user)
          .catch(err => winston.warn(`Could not find user ${event.args.info}: ${err.message}`));
      } else {
        return Promise.resolve();
      }
    })
    .then(() => event);
}

exports.processEvent = processEvent;
