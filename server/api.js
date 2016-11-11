var express = require('express');
var contracts = require('./contracts');

var router = express.Router();
var SpiceMembers = contracts.SpiceMembers.deployed();

function getMember(memberAddress) {
  return Promise.all([
    SpiceMembers.memberId(memberAddress),
    SpiceMembers.memberLevel(memberAddress),
    SpiceMembers.memberInfo(memberAddress)
  ]).then(function(data) {
    return {
      id: data[0].toString(),
      level: data[1].valueOf(),
      info: data[2]
    };
  });
}

router.get('/owner', function(req, res, next) {
  SpiceMembers.owner()
    .then(getMember)
    .then(function(member) { res.json(member) })
    .catch(next);
});

module.exports = router;
