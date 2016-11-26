const socketio = require('socket.io');
const AllEvents = require('web3/lib/web3/allevents');
const common = require('./common');
const utils = require('./utils');
const eth = require('./eth');

const web3 = eth.web3;
const SpiceMembers = eth.contracts.SpiceMembers;
const SpiceHours = eth.contracts.SpiceHours;
const SpiceRates = eth.contracts.SpiceRates;

const pendingTransactions = {};

function handleBlock(io, block) {
  block = Object.assign({}, block);
  block.transactions = block.transactions.map(tx => tx.hash);
  io.emit('block', JSON.stringify(block));
}

function handleLog(io, contracts, data) {
  const contractInfo = findContract(contracts, data.address);
  if (!contractInfo) return;
  const [name, contract] = contractInfo;

  // NOTICE: This uses web3 internals and is a bit ugly, may break later
  const events = contract.abi.filter(json => json.type === 'event');
  const all = new AllEvents(web3._requestManager, events, contract.address);
  const decoded = all.decode(data);

  common.processEvent(decoded)
    .then(event => {
      io.emit(name + '/event', JSON.stringify(event));
    });
}

function handleTransactionReceipt(io, contracts, receipt, proc) {
  const contractInfo = findContract(contracts, receipt.to);
  if (contractInfo) {
    const name = contractInfo[0];
    io.emit(name + '/receipt', JSON.stringify(receipt));
  }

  receipt.logs.forEach(data => {
    handleLog(io, contracts, data, proc);
  });
}

function handleTransaction(io, contracts, tx) {
  const contractInfo = findContract(contracts, tx.to);
  if (!contractInfo) return;

  const name = contractInfo[0];
  if (!tx.blockNumber) {
    io.emit(name + '/pending', JSON.stringify(tx));
    pendingTransactions[tx.hash] = tx;
  } else {
    io.emit(name + '/tx', JSON.stringify(tx));
    delete pendingTransactions[tx.hash];
  }
}

function findContract(contracts, address) {
  return Object.keys(contracts)
    .map(name => [name, contracts[name]])
    .find(([name, contract]) => (address == contract.address));
}

function attachEvents(io, contracts, proc) {
  const latestFilter = web3.eth.filter('latest');
  latestFilter.watch((err, blockid) => {
    if (err) return io.emit('error', err.message);
    web3.eth.getBlock(blockid, true, (err, block) => {
      if (err) return io.emit('error', err.message);

      handleBlock(io, block);
      block.transactions.forEach(tx => {
        const contractInfo = findContract(contracts, tx.to);
        if (!contractInfo) return;

        handleTransaction(io, contracts, tx);
        web3.eth.getTransactionReceipt(tx.hash, (err, receipt) => {
          if (err) return io.emit('error', err.message);
          handleTransactionReceipt(io, contracts, receipt, proc);
        });
      });
    });
  });
}

function attachTransactions(io, contracts) {
  const pendingFilter = web3.eth.filter('pending');
  pendingFilter.watch((err, txid) => {
    if (err) return io.emit('error', err.message);
    web3.eth.getTransaction(txid, (err, tx) => {
      if (err) return io.emit('error', err.message);
      handleTransaction(io, contracts, tx);
    });
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
  attachEvents(io, contracts, processEvent);
  attachTransactions(io, contracts);
}

exports.pending = pendingTransactions;
exports.attach = attach;
