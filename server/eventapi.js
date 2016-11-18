const socketio = require('socket.io');
const utils = require('./utils');
const eth = require('./eth');

const web3 = eth.web3;
const SpiceMembers = eth.contracts.SpiceMembers;
const SpiceHours = eth.contracts.SpiceHours;

const pendingTransactions = {};

function handleTransaction(io, name, tx) {
  if (!name) return; // No name, send nothing

  const timeout = 240000;
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

function attachTransactions(io, addresses) {
  const pendingFilter = web3.eth.filter('pending');
  pendingFilter.watch((err, txid) =>
    web3.eth.getTransaction(txid, (err, tx) => {
      handleTransaction(io, addresses[tx.to], tx);
    })
  );
  return pendingFilter;
}

function attachEvent(io, name, event, proc) {
  const eventFilter = event();
  eventFilter.watch((err, event) => {
    if (err) return io.emit('error', err.message);
    if (proc) event = proc(event);
    io.emit(name + '/event', JSON.stringify(event));
  });
  return eventFilter;
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
  const addresses = {
    [SpiceMembers.address]: 'members',
    [SpiceHours.address]: 'hours'
  };
  attachTransactions(io, addresses);

  const hours = SpiceHours.deployed();
  attachEvent(io, 'hours', hours.MarkHours, processEvent);
  attachEvent(io, 'hours', hours.ProcessPayroll, processEvent);
}

exports.pending = pendingTransactions;
exports.attach = attach;
