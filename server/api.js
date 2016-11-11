var express = require('express');
var contracts = require('./contracts');

var router = express.Router();
var SpiceMembers = contracts.SpiceMembers.deployed();

function hexToBase64(hex) {
  if (hex.indexOf('0x') != 0)
    throw new Error('Invalid hex string');
  return new Buffer(hex.substr(2), 'hex').toString('base64');
}

function base64ToHex(base64) {
  return '0x' + new Buffer(base64, 'base64').toString('hex');
}

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

var NULL_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

function getMember(memberAddress) {
  return Promise.all([
    SpiceMembers.owner(),
    SpiceMembers.memberId(memberAddress),
    SpiceMembers.memberLevel(memberAddress),
    SpiceMembers.memberInfo(memberAddress)
  ]).then(function(data) {
    var member = {
      id: data[1].toNumber()
    };

    if (memberAddress === data[0]) {
      member.level = 'Owner';
    } else {
      member.level = levelName(data[2].toNumber());
    }

    if (data[3] !== NULL_BYTES32) {
      member.info = hexToBase64(data[3]);
    }

    return member;
  });
}

router.get('/members/', function(req, res, next) {
  var i;

  SpiceMembers.memberCount()
    .then(function(count) {
      var promises = [];
      for (i = 1; i<=count.valueOf(); i++) {
        promises.push(SpiceMembers.memberAddress(i));
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

module.exports = router;
