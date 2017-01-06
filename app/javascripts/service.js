(function(context) {
  var state = {};

  var renderEvent = new Event('render');
  function requestRender() {
    context.dispatchEvent(renderEvent);
  }

  function getState() {
    return state;
  }

  function errorHandler(err) {
    requestRender();
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
    if (_.get('payrollsLoading', state))
      return Promise.resolve();
    if (_.get('payrolls', state))
      return Promise.resolve();

    state = _.assoc('payrollsLoading', true, state);
    requestRender();

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
      .catch(errorHandler)
      .then(function() {
        state = _.assoc('payrollsLoading', false, state);
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
    if (_.get(['payrolls', address, 'entriesLoading'], state))
      return Promise.resolve();
    if (_.get(['payrolls', address, 'entries'], state))
      return Promise.resolve();

    state = _.assoc(['payrolls', address, 'entriesLoading'], true, state);
    requestRender();

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
      .catch(errorHandler)
      .then(function() {
        state = _.assoc(['payrolls', address, 'entriesLoading'], false, state);
      })
      .then(requestRender);
  }

  context.Service = {
    getState: getState,
    fetchPayrolls: fetchPayrolls,
    fetchPayrollEntries: fetchPayrollEntries
  };

})(window);
