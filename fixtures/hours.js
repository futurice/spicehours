const utils = require('../server/utils');

module.exports = function(callback) {
  const rates = SpiceRates.deployed();
  const hours = SpiceHours.deployed();
  Promise.resolve()
    .then(() => Promise.all([
      hours.markHours(utils.encryptInfo('jvah'), utils.strToBytes32('foodescr'), 3600),
      hours.markHours(utils.encryptInfo('ttur'), utils.strToBytes32('bardescr'), 5400),
      hours.markHours(utils.encryptInfo('vtai'), utils.strToBytes32('bazdescr'), 7200)
    ]))
    .then(() => rates.setUnpaidPercentage(utils.encryptInfo('vtai'), 40))
    .then(() => Promise.all([
      hours.processPayroll(rates.address, 30*60*60)
    ]))
    .then(() => Promise.all([
      hours.markHours(utils.encryptInfo('jvah'), utils.strToBytes32('foodescr'), 900),
      hours.markHours(utils.encryptInfo('ttur'), utils.strToBytes32('bardescr'), 1800),
      hours.markHours(utils.encryptInfo('vtai'), utils.strToBytes32('bazdescr'), 2700)
    ]))
    .then(() => callback())
    .catch(callback);
};
