var state = {};

var PayrollList = React.createClass({
  propTypes: {
    payrolls: React.PropTypes.array
  },
  render: function() {
    return React.createElement('ul', {},
      this.props.payrolls.map(function(payroll) {
        return React.createElement('li', { key: payroll.address }, payroll.address);
      })
    );
  }
});

function render() {
  var payrollList = React.createElement(PayrollList, { payrolls: _.values(state.payrolls) });
  ReactDOM.render(payrollList, document.getElementById('root'));
}

function fetchData(path, fetcher) {
  fetcher()
    .then(function(value) { state = _.assoc(path, value, state); })
    .then(function() { render(); })
    .catch(function(err) { alert("Error: " + err.toString()); });
}

function fetchPayrolls() {
  var hours = SpiceHours.deployed();
  return hours.payrollCount().then(function(count) {
      return Promise.all(_.range(0, count.toNumber()).map(function(idx) { return hours.payrolls(idx); }))
    })
    .then(function(payrolls) {
      return Promise.all(payrolls.map(function(address, idx) {
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
            locked: values[1],
            entryCount: values[2].toNumber()
          };
        });
      }));
    })
    .then(function(payrolls) {
      return _.keyBy(function(obj) { return obj.address; }, payrolls);
    });
}

window.onload = function() {
  web3.version.getNetwork(function(err, result) {
    if (err) {
      alert("Error finding network: " + err.toString());
      return;
    }
    
    var network_id = result.toString();
    var network_found = true;
    Object.keys(__contracts__).forEach(function(contract_name) {
      var contract = window[contract_name];
      if (contract.all_networks[network_id]) {
        contract.setNetwork(network_id);
      } else {
        network_found = false;
      }
    });

    if (!network_found) {
      alert("Network ID " + network_id + " is not found in all contracts");
      return;
    }
    web3.eth.getAccounts(function(err, accs) {
      if (err != null) {
        alert("There was an error fetching your accounts.");
        return;
      }

      fetchData('payrolls', fetchPayrolls);
    });
  });
}
