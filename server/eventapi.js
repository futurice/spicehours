const socketio = require('socket.io');
const utils = require('./utils');
const eth = require('./eth');

const web3 = eth.web3;
const SpiceMembers = eth.contracts.SpiceMembers;
const SpiceHours = eth.contracts.SpiceHours;
const SpiceRates = eth.contracts.SpiceRates;

const pendingTransactions = {};

function handleTransaction(io, name, tx) {
  const timeout = 0;
  const start = new Date().getTime();

  if (!tx.blockNumber) {
    io.emit(name + '/pending', JSON.stringify(tx));
    pendingTransactions[tx.hash] = tx;
  }

  function sendAfterReceipt() {
    web3.eth.getTransactionReceipt(tx.hash, (err, receipt) => {
      if (err) return io.emit('error', err.message);

      if (receipt) {
        delete pendingTransactions[tx.hash];
        web3.eth.getTransaction(tx.hash, (err, tx) => {
          if (err) return io.emit('error', err.message);
          io.emit(name + '/tx', JSON.stringify(tx));
          io.emit(name + '/receipt', JSON.stringify(receipt));
        });
      } else if (timeout > 0 && new Date().getTime() - start > timeout) {
        io.emit('error', `Transaction ${tx.hash} wasn't processed in ${timeout / 1000} seconds`);
      } else {
        setTimeout(sendAfterReceipt, 200);
      }
    });
  }

  sendAfterReceipt();
}

function findContract(contracts, address) {
  return Object.keys(contracts)
    .map(name => [name, contracts[name]])
    .find(([name, contract]) => (address == contract.address));
}

function attachTransactions(io, contracts) {
  const pendingFilter = web3.eth.filter('pending');
  pendingFilter.watch((err, txid) =>
    web3.eth.getTransaction(txid, (err, tx) => {
      const contractInfo = findContract(contracts, tx.to);
      if (contractInfo) {
        handleTransaction(io, contractInfo[0], tx);
      }
    })
  );
}

function attachEvents(io, name, eventFilter, proc) {
  eventFilter.watch((err, event) => {
    if (err) return io.emit('error', err.message);
    if (proc) event = proc(event);
    io.emit(name + '/event', JSON.stringify(event));
  });
}

function processEvent(event) {
  const args = event.args;
  if (args) {
    if (args.info) args.info = utils.decryptInfo(args.info);
    args.description = utils.bytes32ToStr(args.description);
  }
  return event;
}

function attach(io) {
  const contracts = {
    members: SpiceMembers,
    hours: SpiceHours,
    rates: SpiceRates
  };
  attachTransactions(io, contracts);

  const hours = SpiceHours.deployed();
  attachEvents(io, 'hours', hours.allEvents(), processEvent);

  const rates = SpiceRates.deployed();
  attachEvents(io, 'rates', rates.allEvents(), processEvent);
}

exports.pending = pendingTransactions;
exports.attach = attach;
