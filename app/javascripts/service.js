(function(context) {
  var state = {};

  var renderEvent = new Event('render');
  function requestRender() {
    context.dispatchEvent(renderEvent);
  }

  function errorHandler(err) {
    console.log(err);
    requestRender();
  }

  function getState() {
    return state;
  }

  function attachEvents() {
    var hours = SpiceHours.deployed();
    var markHoursEvent = hours.MarkHours();
    markHoursEvent.watch(function(err, event) {
      if (err) return errorHandler(err);

      // FIXME: The event should have payroll address :(
      var index = _.size(state.payrolls) - 1;
      var findAddress = _.pipe([
        _.values,
        _.find(function(payroll) { return (payroll.index === index); }),
        _.get('address')
      ]);
      var address = findAddress(state.payrolls);
      if (address) {
        state = _.assoc(['payrolls', address, 'entriesUpdated'], true, state);
        fetchPayrollEntries(address);
      }
    });
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
      .catch(function(err) {
        errorHandler(err);
        return [];
      })
      .then(function(accounts) {
        state = _.assoc('accounts', accounts, state);
        state = _.assoc('selectedAccount', accounts[0], state);
      })
      .then(function() {
        state = _.assoc('accountsLoading', false, state);
      })
      .then(requestRender);
  }

  function selectAccount(account) {
    state = _.assoc('selectedAccount', account, state);
    requestRender();
  }

  function markHours(description, duration) {
    var hours = SpiceHours.deployed();
    return Promise.resolve()
      .then(function() {
        if (_.get('markingHours', state))
          throw new Error('Hour marking already in progress');
        if (!_.get('selectedAccount.info', state))
          throw new Error('No valid account selected, cannot mark hours');

        var info = _.get('selectedAccount.info', state);
        var descriptionBytes32 = web3.fromUtf8(description);
        if (descriptionBytes32.length > 66) {
          throw new Error('Description too long');
        } else if (descriptionBytes32.length < 66) {
          descriptionBytes32 += Array(66 - descriptionBytes32.length + 1).join('0');
        }

        if (!_.isInteger(duration)) {
          throw new Error('Duration is not an integer');
        }

        state = _.assoc('markingHours', true, state);
        requestRender();

        return hours.markHours(info, descriptionBytes32, duration, {
          from: _.get('selectedAccount.address', state),
          gas: 150000
        });
      })
      .catch(errorHandler)
      .then(function() {
        state = _.assoc('markingHours', false, state);
      })
      .then(requestRender);
  }

  function processPayroll(maxDuration) {
    var hours = SpiceHours.deployed();
    var rates = SpiceRates.deployed();
    return Promise.resolve()
      .then(function() {
        state = _.assoc('processingPayroll', true, state);
      })
      .then(requestRender)
      .then(function() {
        return hours.processPayroll(rates.address, maxDuration, {
          from: _.get('selectedAccount.address', state),
          gas: 3141592 // Maximum possible gas amount
        });
      })
      .then(function() {
        // FIXME: Should be in event handler but doesn't work well there
        fetchPayrolls(true);
      })
      .catch(errorHandler)
      .then(function() {
        state = _.assoc('processingPayroll', false, state);
      })
      .then(requestRender);
  }

  function lockPayroll(address) {
    var payroll = SpicePayroll.at(address);
    return Promise.resolve()
      .then(function() {
        state = _.assoc(['payrolls', address, 'lockingPayroll'], true, state);
      })
      .then(requestRender)
      .then(function() {
        return payroll.lock({
          from: _.get('selectedAccount.address', state),
          gas: 50000
        });
      })
      .then(function() {
        // FIXME: Wrong place, should be watched in events but attaching is tricky
        state = _.assoc(['payrolls', address, 'locked'], true, state);
      })
      .catch(errorHandler)
      .then(function() {
        state = _.assoc(['payrolls', address, 'lockingPayroll'], false, state);
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

  function fetchPayrolls(forceFetch) {
    if (_.get('payrollsLoading', state))
      return Promise.resolve();
    if (_.get('payrolls', state) && !forceFetch)
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
    if (_.get(['payrolls', address, 'entries'], state)) {
      // Check if entries are updated and we need to reload anyway
      if (!_.get(['payrolls', address, 'entriesUpdated'], state)) {
        return Promise.resolve();
      }
      state = _.assoc(['payrolls', address, 'entriesUpdated'], false, state);
    }

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
    attachEvents: attachEvents,
    fetchAccounts: fetchAccounts,
    selectAccount: selectAccount,
    markHours: markHours,
    processPayroll: processPayroll,
    lockPayroll: lockPayroll,
    fetchPayrolls: fetchPayrolls,
    fetchPayrollEntries: fetchPayrollEntries
  };

})(window);
