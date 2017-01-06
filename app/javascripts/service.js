(function(context) {
  var state = {};

  var renderEvent = new Event('render');
  function requestRender() {
    context.dispatchEvent(renderEvent);
  }

  function getState() {
    return state;
  }

  function fetchPayroll(idx) {
    var hours = SpiceHours.deployed();
    return hours.payrolls(idx)
      .then(function(address) {
        var payroll = SpicePayroll.at(address);
        return Promise.all([
          payroll.processed(),
          payroll.locked(),
          payroll.entryCount()
        ]).then(function(values) {
          return {
            index: idx,
            address: payroll.address,
            processed: values[0],
            locked: values[1]
          };
        });
      });
  }

  function fetchPayrolls() {
    var hours = SpiceHours.deployed();
    return hours.payrollCount()
      .then(function(payrollCount) {
        return Promise.all(
          _.range(0, payrollCount.toNumber()).map(fetchPayroll)
        );
      })
      .then(function(payrolls) {
        var payrollsObject = _.keyBy('address', payrolls);
        state = _.assoc('payrolls', payrollsObject, state);
      })
      .then(requestRender);
  }

  function fetchPayrollEntry(address, idx) {
    var payroll = SpicePayroll.at(address);
    return payroll.entryInfo(idx)
      .then(function(entryInfo) {
        return Promise.all([
          Promise.resolve(entryInfo),
          payroll.duration(entryInfo),
          payroll.payout(entryInfo)
        ]);
      })
      .then(function(values) {
        return {
          info: values[0],
          duration: values[1].toNumber(),
          payout: values[2].toNumber() / 1000000
        };
      });
  }

  function fetchPayrollEntries(address) {
    if (_.get(['payrolls', address, 'entries'], state))
      return Promise.resolve();

    var payroll = SpicePayroll.at(address);
    return payroll.entryCount()
      .then(function(entryCount) {
        return Promise.all(
          _.range(0, entryCount.toNumber())
            .map(_.partial(fetchPayrollEntry, [address]))
        );
      })
      .then(function(entries) {
        state = _.assoc(['payrolls', address, 'entries'], entries, state);
      })
      .then(requestRender);
  }

  context.Service = {
    getState: getState,
    fetchPayrolls: fetchPayrolls,
    fetchPayrollEntries: fetchPayrollEntries
  };

})(window);
