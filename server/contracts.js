var Web3 = require('web3');
var SpiceMembers = require('../build/contracts/SpiceMembers.sol');
var SpiceHours = require('../build/contracts/SpiceHours.sol');
var SpiceRates = require('../build/contracts/SpiceRates.sol');
var SpicePayroll = require('../build/contracts/SpicePayroll.sol');

function checkNetwork(contract) {
  return new Promise(function(resolve, reject) {
    contract.checkNetwork(function(err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

var provider = new Web3.providers.HttpProvider('http://localhost:8545');
var contracts = [
  SpiceMembers,
  SpiceHours,
  SpiceRates,
  SpicePayroll
];
contracts.forEach(function(contract) {
  contract.setProvider(provider);
});

function prepare() {
  return Promise.all(
    contracts.map(function(contract) {
      checkNetwork(contract);
    })
  );
}

module.exports = {
  prepare: prepare,
  SpiceMembers: SpiceMembers,
  SpiceHours: SpiceHours,
  SpiceRates: SpiceRates,
  SpicePayroll: SpicePayroll
};
