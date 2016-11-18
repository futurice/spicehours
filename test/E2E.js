var utils = require('./utils');

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const getEventsPromise = utils.getEventsPromise;
const getTransaction = utils.getTransaction;
const getTransactionError = utils.getTransactionError;

contract("E2E", function(accounts) {
  const owner = accounts[0];
  const director = accounts[1];
  const manager = accounts[2];
  const member = accounts[3];

  const memberInfo = web3.fromUtf8("foobar");
  const outsiderInfo1 = web3.fromUtf8("barbaz");
  const outsiderInfo2 = web3.fromUtf8("bazquux");

  it("should be able to handle a complete payroll", function(done) {
    const members = SpiceMembers.deployed();
    const hours = SpiceHours.deployed();

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
      .then(() => hours.currentPayroll())
      .then(payrollAddress => {
        const payroll = SpicePayroll.at(payrollAddress);
        return Promise.all([
          payroll.duration(memberInfo),
          payroll.duration(outsiderInfo1),
          payroll.duration(outsiderInfo2)
        ]);
      })
      .then(balances => {
        assert.equal(balances[0].toString(), "5400", "member balance incorrect");
        assert.equal(balances[1].toString(), "144000", "outsider1 balance incorrect");
        assert.equal(balances[2].toString(), "5000", "outsider2 balance incorrect");
      })
      .then(() => done())
      .catch(done);
  });

  it("should have calculated the hours correctly", function(done) {
    const hours = SpiceHours.deployed();
    const rates = SpiceRates.deployed();

    const memberInfo = web3.fromUtf8("foobar");
    const outsiderInfo1 = web3.fromUtf8("barbaz");
    const outsiderInfo2 = web3.fromUtf8("bazquux");

    function payoutForInfo(info) {
      if (info.substr(0, memberInfo.length) === memberInfo) return "18000000"; // 1.5h * 0.8 * 15000000
      if (info.substr(0, outsiderInfo1.length) === outsiderInfo1) return "450000000"; // 30h * 15000000
      if (info.substr(0, outsiderInfo2.length) === outsiderInfo2) return "20833333"; // 5000/3600h * 15000000
      return "0";
    }

    Promise.resolve()
      .then(() => getTransaction(() => rates.setUnpaidPercentage(memberInfo, 20)))
      .then(() => getTransaction(() => hours.processPayroll(rates.address, 30*60*60)))
      .then(() => hours.payrollCount())
      .then(payrollCount => {
        assert.equal(payrollCount.toString(), "2", "should have two payrolls");
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
          .then(() => payroll.entryCount())
          .then(entryCount => {
            assert.equal(entryCount.toString(), "3", "should have three payroll lines");
          })
          .then(() => payroll.payout(memberInfo))
          .then(payout => {
            assert.equal(payout.toString(), payoutForInfo(memberInfo), "should have correct payout for " + memberInfo);
          })
          .then(() => payroll.payout(memberInfo))
          .then(payout => {
            assert.equal(payout.toString(), payoutForInfo(memberInfo), "should have correct payout for " + memberInfo);
          })
          .then(() => payroll.payout(memberInfo))
          .then(payout => {
            assert.equal(payout.toString(), payoutForInfo(memberInfo), "should have correct payout for " + memberInfo);
          });
      })
      .then(() => done())
      .catch(done);
  });
});
