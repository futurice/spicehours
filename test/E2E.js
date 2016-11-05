var utils = require('./utils');

var NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
var getTransaction = utils.getTransaction;
var getTransactionError = utils.getTransactionError;

contract("E2E", function(accounts) {
  var owner = accounts[0];
  var director = accounts[1];
  var manager = accounts[2];
  var member = accounts[3];
  var memberInfo = web3.fromUtf8("foobar");

  var outsiderInfo1 = web3.fromUtf8("barbaz");
  var outsiderInfo2 = web3.fromUtf8("bazquux");

  it("should be able to handle a complete payroll", function() {
    var members = SpiceMembers.deployed();
    var hours = SpiceHours.deployed();
    var rates = SpiceRates.deployed();

    return Promise.resolve()
      .then(() => getTransaction(() => members.addMember(director, {from: owner})))
      .then(() => getTransaction(() => members.setMemberLevel(director, 3, {from: owner})))
      .then(() => getTransaction(() => members.addMember(manager), {from: director}))
      .then(() => getTransaction(() => members.setMemberLevel(manager, 2), {from: director}))
      .then(() => getTransaction(() => members.addMember(member), {from: manager}))
      .then(() => getTransaction(() => members.setMemberInfo(member, memberInfo, {from: manager})))
      .then(() => getTransaction(() => hours.markHours(memberInfo, 0, 3600, {from: member})))
      .then(() => getTransaction(() => hours.markHours(memberInfo, 0, 1800, {from: manager})))
      .then(() => getTransaction(() => hours.markHours(outsiderInfo1, 0, 7200, {from: director})))
      .then(() => getTransaction(() => hours.markHours(outsiderInfo2, 0, 5400, {from: owner})))
      .then(() => getTransaction(() => hours.markHours(outsiderInfo2, 0, -400, {from: owner})))
      .then(() => getTransaction(() => hours.fixHours(memberInfo, 0, -900, {from: director})))
      .then(() => Promise.all([
        hours.balance(memberInfo),
        hours.balance(outsiderInfo1),
        hours.balance(outsiderInfo2)
      ]))
      .then(balances => {
        assert.equal(balances[0].toString(), "4500", "member balance incorrect");
        assert.equal(balances[1].toString(), "7200", "outsider1 balance incorrect");
        assert.equal(balances[2].toString(), "5000", "outsider2 balance incorrect");
      });
  });
});
