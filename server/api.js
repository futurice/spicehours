const _ = require('lodash/fp');
const express = require('express');
const eth = require('./eth');
const utils = require('./utils');
const eventapi = require('./eventapi');

const router = express.Router();
const web3 = eth.web3;
const contracts = eth.contracts;
const SpiceMembers = contracts.SpiceMembers;
const SpiceHours = contracts.SpiceHours;

const LEVEL_OWNER = 'Owner';
function levelName(level) {
  switch (level) {
    case 0:
      return 'None';
    case 1:
      return 'Member';
    case 2:
      return 'Manager';
    case 3:
      return 'Director';
    default:
      throw new Error('Unknown level: ' + level);
  }
}

const NULL_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

function getMember(memberAddress) {
  const members = SpiceMembers.deployed();
  return Promise.all([
    members.owner(),
    members.memberId(memberAddress),
    members.memberLevel(memberAddress),
    members.memberInfo(memberAddress)
  ]).then(function(data) {
    var member = {
      id: data[1].toNumber(),
      address: memberAddress
    };

    if (memberAddress === data[0]) {
      member.level = LEVEL_OWNER;
    } else {
      member.level = levelName(data[2].toNumber());
    }

    if (data[3] !== NULL_BYTES32) {
      member.info = utils.decryptInfo(data[3]);
    }

    return member;
  });
}

router.get('/members/', (req, res, next) => {
  var i;

  const members = SpiceMembers.deployed();
  members.memberCount()
    .then(function(count) {
      var promises = [];
      for (i = 1; i<=count.toNumber(); i++) {
        promises.push(members.memberAddress(i));
      }
      return Promise.all(promises);
    })
    .then(function(addresses) {
      return Promise.all(
        addresses.map(getMember)
      );
    })
    .then(function(members) { res.json(members) })
    .catch(next);
});

function handleTransaction(method, ...args) {
  if (!_.isPlainObject(_.last(args)))
    args.push({});

  return _.spread(method.estimateGas)(args)
    .then(usedGas => {
       // geth uses 50000000 as maximum gas amount
       if (usedGas.toString() === '50000000')
         throw new Error('Transaction throwed during gas estimation');
       return usedGas;
     })
    .then(usedGas => {
      const options = _.assoc('gas', usedGas, _.last(args));
      const newArgs = _.concat(_.dropRight(1, args), [options]);
      return _.spread(method)(newArgs);
    });
}

function getEvents(event, ...args) {
  return new Promise((resolve, reject) => {
    _.spread(event)(args).get((err, events) => {
      if (err) return reject(err);
      resolve(events);
    });
  });
}

router.post('/hours/:info', (req, res, next) => {
  if (!_.isNumber(req.body.duration))
    return res.status(400).json(errorJson('Bad Request'));

  const info = utils.encryptInfo(req.params.info);
  const descr = utils.strToBytes32(req.body.description);
  const duration = req.body.duration;

  const hours = SpiceHours.deployed();
  handleTransaction(hours.markHours, info, descr, duration)
    .then(function(txid) {
      res.status(204).send();
    }).catch(next);
});

router.get('/hours/balances', (req, res, next) => {
  const hours = SpiceHours.deployed();
  hours.infoCount()
    .then(count =>
      Promise.all(_.map(idx => hours.infos(idx), _.range(0, count.toNumber())))
    )
    .then(infos =>
      Promise.all(_.map(info => hours.balance(info), infos))
        .then(_.zipObject(_.map(utils.decryptInfo, infos)))
    )
    .then(balances => res.json(balances))
    .catch(next);
});

function errorJson(err) {
  if (_.isError(err)) {
    return { error: err.message.split('\n')[0] };
  } else {
    return { error: err };
  }
}

router.get('/block/:id', (req, res, next) => {
  web3.eth.getBlock(req.params.id, (err, block) => {
    if (err) res.status(404).json(errorJson(err));
    res.json(block);
  });
});

function processEvent(event) {
  event = _.flow(
    _.update('args.info', info => info && utils.decryptInfo(info)),
    _.update('args.description', utils.bytes32ToStr)
  )(event);

  return Promise.resolve(event);
}

router.get('/hours/pending', (req, res, next) => {
  const allPending = eventapi.pending;
  const pending = Object.keys(allPending)
    .map(txid => allPending[txid])
    .filter(tx => !!tx);
  res.json(pending);
});

router.get('/hours/events', (req, res, next) => {
  const fromBlock = 0;
  const hours = SpiceHours.deployed();
  getEvents(hours.allEvents, { fromBlock })
    .then(events => Promise.all(_.map(processEvent, events)))
    .then(events => res.json(events))
    .catch(next);
});

router.get('/hours/:info/events', (req, res, next) => {
  const filter = { info: utils.encryptInfo(req.params.info) };
  const fromBlock = 0;

  const hours = SpiceHours.deployed();
  Promise.all([
    getEvents(hours.MarkHours, filter, { fromBlock }),
    getEvents(hours.ProcessPayroll, filter, { fromBlock })
  ]).then(([markEvents, processEvents]) =>
    _.sortBy(['blockNumber', 'logIndex'], _.concat(markEvents, processEvents))
  )
  .then(events => Promise.all(_.map(processEvent, events)))
  .then(events => res.json(events))
  .catch(err => next(err));
});

module.exports = router;
