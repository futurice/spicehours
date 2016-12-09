const eth = require('../server/eth');

const SpiceHours = eth.contracts.SpiceHours;
const SpiceRates = eth.contracts.SpiceRates;

eth.prepare().then(() => {
  const hours = SpiceHours.deployed();
  const rates = SpiceRates.deployed();

  console.log('Processing payroll');
  return hours.processPayroll(rates.address, 30*60*60, {from: '0x6799A1D5F574eF1C376F5515eE7e2B8b06B30754', gas: 1000000 });
}).then(() => {
  console.log('Processed payroll successfully');
}).catch(err => console.log(err));
