const _ = require('lodash/fp');
const express = require('express');
const eth = require('./eth');
const user = require('./user');
const utils = require('./utils');
const common = require('./common');
const bitly = require('./bitly');
const excel = require('./excel');
const eventapi = require('./eventapi');
const flowdock = require('./flowdock');

const router = express.Router();
const web3 = eth.web3;
const contracts = eth.contracts;
const SpiceMembers = contracts.SpiceMembers;
const SpiceHours = contracts.SpiceHours;
const SpicePayroll = contracts.SpicePayroll;
const SpiceRates = contracts.SpiceRates;

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
      const gas = usedGas * 2;
      const options = _.assoc('gas', gas, _.last(args));
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

function errorJson(err) {
  if (_.isError(err)) {
    return { error: err.message.split('\n')[0] };
  } else {
    return { error: err };
  }
}

router.get('/profile', (req, res, next) => {
  if (!req.pubtkt || !req.pubtkt.uid)
    return res.status(400).json(errorJson('Bad Request'));

  const output = {};
  const username = req.pubtkt.uid;
  const hours = SpiceHours.deployed();
  const rates = SpiceRates.deployed();
  user.getUser(username)
    .then(userObj => output.user = userObj)
    .then(() => hours.payrollCount())
    .then(count => hours.payrolls(count.minus(1)))
    .then(payrollAddress => SpicePayroll.at(payrollAddress))
    .then(payroll => payroll.duration(utils.encryptInfo(username)))
    .then(duration => output.duration = duration)
    .then(() => rates.unpaidPercentage(utils.encryptInfo(username)))
    .then(unpaid => output.unpaidPercentage = parseInt(unpaid, 10))
    .then(() => res.json(output))
    .catch(err => next(err));
});

router.get('/block/:id(0x[0-9a-f]{64}|latest)', (req, res, next) => {
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

router.post('/hours/', (req, res, next) => {
  if (!req.body.title)
    return res.status(400).json(errorJson('Bad Request'));
  if (!_.isNumber(req.body.duration))
    return res.status(400).json(errorJson('Bad Request'));
  if (!req.pubtkt || !req.pubtkt.uid)
    return res.status(400).json(errorJson('Bad Request'));

  let userObj;
  const info = utils.encryptInfo(req.pubtkt.uid);
  let title = req.body.title;
  const duration = req.body.duration;
  const description = req.body.description;

  const hours = SpiceHours.deployed();
  user.getUser(req.pubtkt.uid)
    .then(user => userObj = user || req.pubtkt.uid)
    .then(() => {
      if (common.urlRegex.test(title)) {
        return bitly.shortenURL(title)
          .then(data => title = data.url)
          .catch(err => winston.warn(`URL shortening failed: ${err.message}`));
      } else {
        return Promise.resolve();
      }
    })
    .then(() =>
      handleTransaction(hours.markHours, info, utils.strToBytes32(title), duration)
    )
    .then(txid =>
      flowdock.sendMarking(userObj, title, duration, description, txid)
    )
    .then(() => res.status(204).send())
    .catch(next);
});

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
    .then(events => Promise.all(_.map(common.processEvent, events)))
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

router.get('/hours/payrolls', (req, res, next) => {
  const hours = SpiceHours.deployed();
  hours.payrollCount()
    .then(count =>
      Promise.all(_.range(0, count).map(i => hours.payrolls(i)))
    )
    .then(events => res.json(events))
    .catch(err => next(err));
});

function getPayrollEntries(payrollAddress, processed) {
  const payroll = SpicePayroll.at(payrollAddress);
  return payroll.entryCount()
    .then(entryCount =>
      Promise.all(_.range(0, entryCount).map(i => payroll.entryInfo(i)))
    )
    .then(infos => {
      const entries = {};
      return Promise.all(
        infos.map(info => {
          const decrypted = utils.decryptInfo(info);
          return Promise.resolve()
            .then(() => entries[decrypted] = {})
            .then(() => payroll.duration(info))
            .then(duration => entries[decrypted].duration = duration)
            .then(() => {
              if (processed) {
                return payroll.payout(info)
                  .then(payout => entries[decrypted].payout = payout);
              } else {
                return Promise.resolve();
              }
            })
            .then(() => common.processPayrollEntry(decrypted, entries[decrypted]))
            .then(entry => entries[decrypted] = entry);
        })
      ).then(() => entries);
    })
}

function getPayroll(address) {
  const payroll = SpicePayroll.at(address);
  const payrollObj = {};

  return Promise.resolve()
    .then(() => payroll.locked())
    .then(locked => payrollObj.locked = locked)
    .then(() => payroll.processed())
    .then(processed => {
      payrollObj.processed = processed;
      return getPayrollEntries(payroll.address, processed)
    })
    .then(entries => payrollObj.entries = entries)
    .then(() => payroll.fromBlock())
    .then(fromBlock => getEvents(payroll.allEvents, { fromBlock }))
    .then(events => Promise.all(_.map(common.processEvent, events)))
    .then(events => payrollObj.events = events)
    .then(() => payrollObj);
}

router.get('/payrolls/:address(0x[0-9a-f]{40})', (req, res, next) => {
  const hours = SpiceHours.deployed();
  const address = req.params.address;
  hours.hasPayroll(address)
    .then(hasPayroll => {
      if (!hasPayroll) return res.status(404).send(errorJson('Not Found'));
      return getPayroll(address).then(payroll => res.json(payroll));
    })
    .catch(err => next(err));
});

router.get('/payrolls/:address(0x[0-9a-f]{40})/excel', (req, res, next) => {
  const hours = SpiceHours.deployed();
  const address = req.params.address;
  hours.hasPayroll(address)
    .then(hasPayroll => {
      if (!hasPayroll) return res.status(404).send(errorJson('Not Found'));
      return getPayroll(address).then(payroll => {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=payroll-' + address + '.xlsx');
        res.send(excel.payrollToExcel(payroll));
      });
    })
    .catch(err => next(err));
});

router.get('/rates/', (req, res, next) => {
  const output = {};
  const rates = SpiceRates.deployed();
  rates.hourlyRate()
    .then(rate => output.hourlyRate = rate)
    .then(() => output.entries = {})
    .then(() => rates.entryCount())
    .then(count =>
      Promise.all(_.range(0, count).map(idx => rates.entryInfo(idx)))
    )
    .then(infos =>
      Promise.all(infos.map(info => {
        console.log(info);
        const username = utils.decryptInfo(info);
        output.entries[username] = {};
        return rates.unpaidPercentage(info)
          .then(rate => output.entries[username].unpaidPercentage = parseInt(rate, 10))
          .then(() => user.getUser(username))
          .then(user => output.entries[username].user = user);
      }))
    )
    .then(() => res.json(output))
    .catch(err => next(err));
});

module.exports = router;
