const socketio = require('socket.io');
const eth = require('./eth');

const web3 = eth.web3;
const SpiceMembers = eth.contracts.SpiceMembers;
const SpiceHours = eth.contracts.SpiceHours;

function sendTransaction(io, name, tx) {
  if (!name) return; // No name, send nothing

  const timeout = 240000;
  const start = new Date().getTime();

  if (!tx.blockNumber) {
    io.emit(name + '/pending', JSON.stringify(tx));
  }

  function sendAfterReceipt() {
    web3.eth.getTransactionReceipt(tx.hash, (err, receipt) => {
      if (err) return io.emit('error', err.message);

      if (receipt) {
        web3.eth.getTransaction(tx.hash, (err, tx) => {
          if (err) return io.emit('error', err.message);
          io.emit(name + '/tx', JSON.stringify(tx));
          io.emit(name + '/receipt', JSON.stringify(receipt));
        });
      } else if (timeout > 0 && new Date().getTime() - start > timeout) {
        io.emit('error', `Transaction ${tx.hash} wasn't processed in ${timeout / 1000} seconds`);
      } else {
        setTimeout(sendAfterReceipt, 1000);
      }
    });
  }

  sendAfterReceipt();
}

function attachTransactions(io, addresses) {
  const pendingFilter = web3.eth.filter('pending');
  pendingFilter.watch((err, txid) =>
    web3.eth.getTransaction(txid, (err, tx) => {
      sendTransaction(io, addresses[tx.to], tx);
    })
  );
}

function attach(io) {
  const addresses = {
    [SpiceMembers.address]: 'members',
    [SpiceHours.address]: 'hours'
  };
  attachTransactions(io, addresses);
}

exports.attach = attach;
