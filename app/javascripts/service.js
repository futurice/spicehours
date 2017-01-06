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
    console.log(err);
    requestRender();
  }

  function fetchAccounts() {
    if (_.get('accountsLoading', state))
      return Promise.resolve();
    if (_.get('accounts', state))
      return Promise.resolve();

    state = _.assoc('accountsLoading', true, state);
    requestRender();

    var members = SpiceMembers.deployed();
    return Promise.resolve()
      .then(function() {
        return new Promise(function(resolve, reject) {
          web3.eth.getAccounts(function(err, accs) {
            if (err) return reject(err);
            resolve(accs);
          });
        });
      })
      .then(function(accounts) {
        return Promise.all(
          accounts.map(function(address) {
            return members.memberLevel(address)
          })
        ).then(function(memberLevels) {
          return _.map(
            function(pair) { return { address: pair[0], level: pair[1].toNumber() } },
            _.filter(
              function(pair) { return !pair[1].isZero(); },
              _.zip(accounts, memberLevels)
            )
          );
        });
      })
      .then(function(accounts) {
        return Promise.all(
          accounts.map(function(account) {
            return Promise.all([
              members.memberId(account.address),
              members.memberInfo(account.address)
            ]).then(function(values) {
              var fields = {};
              fields.id = values[0].toNumber();
              if (!/0x0{64}/.test(values[1])) {
                fields.info = values[1];
              }
              return _.assign(account, fields);
            });
          })
        );
      })
      .then(function(accounts) {
        return _.sortBy([function(account) { return -account.level; }], accounts);
      })
      .then(function(accounts) {
        state = _.assoc('accounts', accounts, state);
        state = _.assoc('selectedAccount', accounts[0], state);
      })
      .catch(errorHandler)
      .then(function() {
        state = _.assoc('accountsLoading', false, state);
      })
      .then(requestRender);
  }

  function fetchPayroll(idx) {
    var hours = SpiceHours.deployed();
    return hours.payrolls(idx)
      .then(function(address) {
        var payroll = SpicePayroll.at(address);
        var fromBlockPromise = payroll.fromBlock();
        var toBlockPromise = payroll.toBlock();
        function getBlockTimestamp(blockNumber) {
          if (blockNumber.isZero()) return;
          return new Promise(function(resolve, reject) {
            web3.eth.getBlock(blockNumber, function(err, block) {
              if (err) return reject(err);
              resolve(block.timestamp);
            });
          });
        }
        return Promise.all([
          payroll.processed(),
          payroll.locked(),
          fromBlockPromise,
          fromBlockPromise.then(getBlockTimestamp),
          toBlockPromise,
          toBlockPromise.then(getBlockTimestamp)
        ]).then(function(values) {
          var fields = {
            index: idx,
            address: payroll.address,
            processed: values[0],
            locked: values[1],
            fromBlock: values[2].toNumber(),
            fromTimestamp: values[3]
          };
          if (fields.processed) {
            fields.toBlock = values[4].toNumber();
            fields.toTimestamp = values[5];
          }
          return fields;
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
    fetchAccounts: fetchAccounts,
    fetchPayrolls: fetchPayrolls,
    fetchPayrollEntries: fetchPayrollEntries
  };

})(window);
