const _ = require('lodash/fp');
const Web3 = require('web3');
const config = require('./config');

const SpiceMembers = require('../build/contracts/SpiceMembers.sol');
const SpiceHours = require('../build/contracts/SpiceHours.sol');
const SpiceRates = require('../build/contracts/SpiceRates.sol');
const SpicePayroll = require('../build/contracts/SpicePayroll.sol');

var provider = new Web3.providers.HttpProvider('http://localhost:8545');
var web3 = new Web3(provider);

var contracts = { SpiceMembers, SpiceHours, SpiceRates, SpicePayroll };
_.each(contract => contract.setProvider(provider), _.values(contracts));

function checkNetworks() {
  function checkNetwork(contract) {
    // testrpc throws needless errors here so we catch
    return new Promise((resolve, reject) =>
      contract.checkNetwork(err => {
        if (err) return reject(err);
        resolve();
      })
    ).catch(err => { console.log(err.message) });
  }
  return Promise.all(_.map(checkNetwork, _.values(contracts)));
}

function checkDeployed() {
  SpiceMembers.deployed();
  SpiceHours.deployed();
  SpiceRates.deployed();

  // We need at least 15 minutes until we timeout promises
  SpiceMembers.synchronization_timeout = 900000;
  SpiceHours.synchronization_timeout = 900000;
  SpiceRates.synchronization_timeout = 900000;
  SpicePayroll.synchronization_timeout = 900000;
}

function getAccounts() {
  return new Promise((resolve, reject) => {
    web3.eth.getAccounts((err, result) => {
      if (err) return reject(err);
      resolve(result);
    })
  });
}

function setDefaultAccount(accounts) {
  const account = _.getOr(accounts[0], 'ACCOUNT', config);
  if (_.isNil(account))
    throw new Error('Account not found');
  if (!_.includes(account, accounts))
    throw new Error(`Account ${account} not found`);

  const defaults = { from: account };
  _.each(contract => contract.defaults(defaults), _.values(contracts));
}

function prepare() {
  return Promise.resolve()
    .then(checkNetworks)
    .then(checkDeployed)
    .then(getAccounts)
    .then(setDefaultAccount);
}

module.exports = {
  web3,
  prepare,
  contracts
};
