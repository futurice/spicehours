const winston = require('winston');
const Bitly = require('bitly');
const utils = require('./utils');
const web3 = require('./eth').web3;
const fum = require('./fum');

// See https://gist.github.com/dperini/729294
const urlRegex = /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?$/i

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

exports.urlRegex = urlRegex;
exports.processEvent = processEvent;
