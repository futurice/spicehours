var utils = require('./utils');

var NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
var getEventsPromise = utils.getEventsPromise;
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

  it("should be able to handle a complete payroll", function(done) {
    var members = SpiceMembers.deployed();
    var hours = SpiceHours.deployed();

    Promise.resolve()
      .then(() => getTransaction(() => members.addMember(director, {from: owner})))
      .then(() => getTransaction(() => members.setMemberLevel(director, 3, {from: owner})))
      .then(() => getTransaction(() => members.addMember(manager), {from: director}))
      .then(() => getTransaction(() => members.setMemberLevel(manager, 2, {from: director})))
      .then(() => getTransaction(() => members.addMember(member, {from: manager})))
      .then(() => getTransaction(() => members.setMemberInfo(member, memberInfo, {from: manager})))
      .then(() => getTransaction(() => hours.markHours(memberInfo, 0, 3600, {from: member})))
      .then(() => getTransaction(() => hours.markHours(memberInfo, 0, 1800, {from: manager})))
      .then(() => getTransaction(() => hours.markHours(outsiderInfo1, 0, 144000, {from: director})))
      .then(() => getTransaction(() => hours.markHours(outsiderInfo2, 0, 5400, {from: owner})))
      .then(() => getTransaction(() => hours.markHours(outsiderInfo2, 0, -400, {from: owner})))
      .then(() => Promise.all([
        hours.balance(memberInfo),
        hours.balance(outsiderInfo1),
        hours.balance(outsiderInfo2)
      ]))
      .then(balances => {
        assert.equal(balances[0].toString(), "5400", "member balance incorrect");
        assert.equal(balances[1].toString(), "144000", "outsider1 balance incorrect");
        assert.equal(balances[2].toString(), "5000", "outsider2 balance incorrect");
        done();
      })
      .catch(done);
  });

  it("should have calculated the hours correctly", function(done) {
    var hours = SpiceHours.deployed();
    var rates = SpiceRates.deployed();

    function payoutForInfo(info) {
      if (info.substr(0, memberInfo.length) === memberInfo) return "18000000"; // 1.5h * 0.8 * 15000000
      if (info.substr(0, outsiderInfo1.length) === outsiderInfo1) return "450000000"; // 30h * 15000000
      if (info.substr(0, outsiderInfo2.length) === outsiderInfo2) return "20833333"; // 5000/3600h * 15000000
      return "0";
    }

    Promise.resolve()
      .then(() => getTransaction(() => rates.setUnpaidPercentage(memberInfo, 20)))
      .then(() => getTransaction(() => hours.processPayroll(rates.address)))
      .then(() => hours.payrollCount())
      .then(payrollCount => {
        assert.equal(payrollCount.valueOf(), 1, "should have one payroll");
      })
      .then(() => hours.payrolls(0))
      .then(payrollAddress => {
        assert.notEqual(payrollAddress, NULL_ADDRESS, "should not be null");
        var payroll = SpicePayroll.at(payrollAddress);

        return Promise.resolve()
          .then(() => getEventsPromise(payroll.allEvents()))
          .then(events => {
            assert.equal(events.length, 4, "incorrect amount of events emitted");
          })
          .then(events => console.log(events))
          .then(() => payroll.lineCount())
          .then(lineCount => {
            assert.equal(lineCount.valueOf(), 3, "should have three payroll lines");
          })
          .then(() => Promise.all([
            payroll.lineInfo(0),
            payroll.linePayout(0)
          ]))
          .then(line => {
            assert.equal(line[1].toString(), payoutForInfo(line[0]), "should have correct payout for " + line[0]);
          })
          .then(() => Promise.all([
            payroll.lineInfo(1),
            payroll.linePayout(1)
          ]))
          .then(line => {
            assert.equal(line[1].toString(), payoutForInfo(line[0]), "should have correct payout for " + line[0]);
          })
          .then(() => Promise.all([
            payroll.lineInfo(2),
            payroll.linePayout(2)
          ]))
          .then(line => {
            assert.equal(line[1].toString(), payoutForInfo(line[0]), "should have correct payout for " + line[0]);
          });
      })
      .then(() => done())
      .catch(done);
  });
});
