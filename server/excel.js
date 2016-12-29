const _ = require('lodash/fp');
const XLSX = require('xlsx');
const Workbook = require('workbook');

function payrollPaidRows(payroll) {
  const users = Object.keys(payroll.entries);
  const headRow = [
    'Username',
    'HR Number',
    'Name',
    'Paid (euros)'
  ];
  const userRows = users.map(username => {
    const user = payroll.entries[username];
    return [
      username,
      _.get('user.hr_number', user) || '',
      _.get('user.first_name', user) + ' ' + _.get('user.last_name', user) || '',
      parseInt(user.payout ? user.payout.toString().slice(0, -4) : '', 10) / 100 || 0
    ];
  });
  const sortedRows = _.sortBy(row => row[1] || Infinity, userRows);
  return [ headRow ].concat(sortedRows);
}

function payrollHistory(payroll) {
  const events = payroll.events;
  const headRow = [
    'Event type',
    'Username',
    'Description',
    'Duration (hours)',
    'Payout (euros)'
  ];
  const eventRows = events.map(event => {
    console.log(event);
    return [
      event.event,
      _.get('args.info', event) || '',
      _.get('args.description', event) || '',
      parseInt(event.args.duration ? event.args.duration.toString() : '', 10) / 3600 || '',
      parseInt(event.args.payout ? event.args.payout.toString().slice(0, -4) : '', 10) / 100 || ''
    ];
  });
  return [ headRow ].concat(eventRows);
}

function payrollToExcel(payroll) {
  const workbook = new Workbook();
  workbook.addRowsToSheet('Payroll', payrollPaidRows(payroll));
  workbook.setColWidthChars('Payroll', 0, 10);
  workbook.setColWidthChars('Payroll', 1, 10);
  workbook.setColWidthChars('Payroll', 2, 20);
  workbook.setColWidthChars('Payroll', 3, 10);
  workbook.addRowsToSheet('Events', payrollHistory(payroll));
  workbook.setColWidthChars('Events', 0, 20);
  workbook.setColWidthChars('Events', 2, 20);
  workbook.setColWidthChars('Events', 3, 15);
  workbook.setColWidthChars('Events', 4, 15);
  workbook.finalize();

  const wopts = { bookType: 'xlsx', type: 'buffer' };
  return XLSX.write(workbook, wopts);
}

exports.payrollToExcel = payrollToExcel;
