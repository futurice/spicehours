(function(context) {
  var LEVEL_DIRECTOR = 3;

  function formatDateTime(timestamp) {
    var formatter = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    return formatter.format(new Date(timestamp * 1000));
  }

  function formatEuros(value) {
    var formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'EUR'
    });
    return formatter.format(value);
  }

  var LoadingScreen = React.createClass({
    render: function() {
      return React.createElement('div',
        { className: 'loading-screen' },
        React.createElement('h3', {}, this.props.children)
      );
    }
  });

  var Header = React.createClass({
    render: function() {
      return React.createElement('h1', {}, 'SpiceHours Admin UI');
    }
  });

  var AccountSelector = React.createClass({
    propTypes: {
      accounts: React.PropTypes.array.isRequired,
      selectedAccount: React.PropTypes.object
    },
    handleChange: function(event) {
      var account = _.find(function(account) {
        return account.address === event.target.value;
      }, this.props.accounts);
      if (account) Service.selectAccount(account);
    },
    render: function() {
      var accounts = this.props.accounts;
      var selectedAccount = this.props.selectedAccount || accounts[0];

      function getAccountLevel(account) {
        switch(account.level) {
          case 3: return 'Director';
          case 2: return 'Manager';
          case 1: return 'Member';
          default: return 'None';
        }
      }

      if (accounts.length > 0) {
        return React.createElement('div', { className: 'account-selector panel panel-default' },
          React.createElement('div', { className: 'panel-heading' },
            React.createElement('strong', {}, 'Select Account:')
          ),
          React.createElement('div', { className: 'panel-body' },
            React.createElement('div', { className: 'row' },
              React.createElement('div', { className: 'col-sm-6' },
                React.createElement('select',
                  {
                    className: 'form-control',
                    value: selectedAccount.address,
                    onChange: this.handleChange
                  },
                  accounts.map(function(account) {
                    var isSelected = _.isEqual(account, selectedAccount);
                    return React.createElement('option',
                      { key: account.address, value: account.address },
                      account.address
                    );
                  })
                )
              ),
              React.createElement('div', { className: 'col-sm-6' },
                React.createElement('div', { className: 'account-level' },
                  'Account level: ' + getAccountLevel(selectedAccount)
                )
              )
            )
          )
        );
      } else {
        return React.createElement('div', { className: 'account-selector panel panel-default' },
          React.createElement('div', { className: 'panel-heading' },
            React.createElement('strong', {}, 'No account found, using read-only mode')
          )
        );
      }
    }
  });

  var HourMarker = React.createClass({
    propTypes: {
      selectedAccount: React.PropTypes.object,
      markingHours: React.PropTypes.bool
    },
    getInitialState: function() {
      return {
        description: '',
        duration: 60
      };
    },
    handleDescriptionChange: function(event) {
      this.setState({ description: event.target.value });
    },
    handleDurationChange: function(event) {
      this.setState({ duration: parseInt(event.target.value, 10) });
    },
    handleSubmit: function(event) {
      // Convert duration to seconds instead of minutes
      Service.markHours(this.state.description, this.state.duration * 60);
    },
    render: function() {
      var selectedAccount = this.props.selectedAccount;
      if (!_.get('info', selectedAccount)) return null;

      var markingHours = this.props.markingHours;
      return React.createElement('div', { className: 'hour-marker panel panel-default' },
        React.createElement('div', { className: 'panel-heading' },
          React.createElement('strong', {}, 'Mark Hours:')
        ),
        React.createElement('div', { className: 'panel-body' },
          React.createElement('div', { className: 'row' },
            React.createElement('div', { className: 'col-sm-6' },
              React.createElement('label', { htmlFor: 'mark-description' }, 'Description'),
              React.createElement('input', {
                id: 'mark-description',
                type: 'text',
                value: this.state.description,
                disabled: markingHours,
                className: 'form-control',
                onChange: this.handleDescriptionChange
              })
            ),
            React.createElement('div', { className: 'col-sm-4' },
              React.createElement('label', { htmlFor: 'mark-duration' }, 'Duration (minutes)'),
              React.createElement('input', {
                id: 'mark-duration',
                type: 'number',
                pattern: '\d*',
                value: this.state.duration,
                disabled: markingHours,
                className: 'form-control',
                onChange: this.handleDurationChange
              })
            ),
            React.createElement('div', { className: 'col-sm-2' },
              React.createElement('label', {}, '\u00a0'),
              React.createElement('input', {
                type: 'submit',
                value: 'Submit',
                disabled: markingHours,
                className: 'form-control btn btn-default',
                onClick: this.handleSubmit
              })
            )
          ),
          markingHours && React.createElement('div',
            { style: { marginTop: '20px', textAlign: 'center' } },
            'Marking transaction in progress, please wait...'
          )
        )
      );
    }
  });

  var PayrollContent = React.createClass({
    propTypes: {
      payroll: React.PropTypes.object.isRequired
    },
    render: function() {
      var payroll = this.props.payroll;
      var entriesLoading = payroll.entriesLoading;
      var entries = payroll.entries;
      var processed = payroll.processed;
      if (entriesLoading || !entries) {
        return React.createElement('div', {}, 'Loading...');
      }
      var totalDuration = entries.reduce(function(duration, entry) {
        return duration + (entry.duration || 0);
      }, 0);
      var totalPayout = entries.reduce(function(payout, entry) {
        return payout + (entry.payout || 0);
      }, 0);

      return React.createElement('table', { className: 'table' },
        React.createElement('caption', {},
          'Total of ' + entries.length + ' users marked hours to this payroll'
        ),
        React.createElement('thead', {},
          React.createElement('tr', {},
            React.createElement('th', {}, 'User'),
            React.createElement('th', {}, 'Duration (minutes)'),
            processed && React.createElement('th', {}, 'Payout')
          )
        ),
        React.createElement('tbody', {},
          entries.map(function(entry) {
            return React.createElement('tr', { key: entry.info },
              React.createElement('td', {}, entry.info.substr(2, 8)),
              React.createElement('td', {}, entry.duration / 60),
              processed && React.createElement('td', {}, formatEuros(entry.payout))
            );
          }),
          React.createElement('tr', {},
            React.createElement('td', {}, React.createElement('b', {}, 'Total')),
            React.createElement('td', {}, totalDuration / 60),
            processed && React.createElement('td', {}, formatEuros(totalPayout))
          )
        )
      );
    }
  });

  var ProcessPayrollButton = React.createClass({
    propTypes: {
      selectedAccount: React.PropTypes.object,
      payroll: React.PropTypes.object.isRequired,
      processingPayroll: React.PropTypes.bool
    },
    getInitialState: function() {
      return {
        confirmingClick: false
      };
    },
    handleProcess: function(event) {
      this.setState({
        confirmingClick: true
      });
    },
    handleConfirm: function(event) {
      if (this.state.confirmingClick) {
        // Hardcoded 30 hours as max duration
        var maxDuration = 30*60*60;
        Service.processPayroll(maxDuration);
      }
    },
    render: function() {
      var payroll = this.props.payroll;
      var processingPayroll = this.props.processingPayroll;
      var confirmingClick = this.state.confirmingClick;
      if (!payroll.processed) {
        if (processingPayroll) {
          return React.createElement('button', {
            className: 'btn btn-default disabled',
            type: 'submit'
          }, 'Processing Payroll...');
        } else if (confirmingClick) {
          return React.createElement('button', {
            className: 'btn btn-warning',
            type: 'submit',
            onClick: this.handleConfirm
          }, 'Confirm Process');
        } else {
          return React.createElement('button', {
            className: 'btn btn-default',
            type: 'submit',
            onClick: this.handleProcess
          }, 'Process Payroll');
        }
      }
      return null;
    }
  });

  var LockPayrollButton = React.createClass({
    propTypes: {
      selectedAccount: React.PropTypes.object,
      payroll: React.PropTypes.object.isRequired
    },
    handleClick: function(event) {
      Service.lockPayroll(this.props.payroll.address);
    },
    render: function() {
      var payroll = this.props.payroll;
      if (payroll.processed && !payroll.locked) {
        if (payroll.lockingPayroll) {
          return React.createElement('button', {
            className: 'btn btn-default disabled',
            type: 'submit'
          }, 'Locking Payroll...');
        } else {
          return React.createElement('button', {
            className: 'btn btn-default',
            type: 'submit',
            onClick: this.handleClick
          }, 'Lock Payroll');
        }
      }
      return null;
    }
  });

  var PayrollStatus = React.createClass({
    propTypes: {
      payroll: React.PropTypes.object.isRequired
    },
    render: function() {
      if (this.props.payroll.locked) {
        return React.createElement('span', {
          className: 'glyphicon glyphicon-lock',
          'aria-hidden': true
        });
      }
      return null;
    }
  });

  var PayrollPanel = React.createClass({
    propTypes: {
      selectedAccount: React.PropTypes.object,
      payroll: React.PropTypes.object.isRequired,
      processingPayroll: React.PropTypes.bool,
      expanded: React.PropTypes.bool,
      parent: React.PropTypes.string,
    },
    componentDidMount: function() {
      var address = this.props.payroll.address;
      $(ReactDOM.findDOMNode(this)).find('.collapse')
        .on('show.bs.collapse', function() {
          Service.fetchPayrollEntries(address);
        });
    },
    componentWillUnmount: function() {
      $(ReactDOM.findDOMNode(this)).find('.collapse')
        .off('show.bs.collapse');
    },
    render: function() {
      var selectedAccount = this.props.selectedAccount;
      var payroll = this.props.payroll;
      var processingPayroll = this.props.processingPayroll;
      var expanded = !!this.props.expanded;

      var address = payroll.address;
      var headingId = 'heading-' + address;
      var collapseId = 'collapse-' + address;
      var isDirector = (_.get('level', selectedAccount) >= LEVEL_DIRECTOR);
      return React.createElement('div', { className: 'panel panel-default' },
        React.createElement('div', { id: headingId, className: 'panel-heading', role: 'tab' },
          React.createElement('div', { className: 'row' },
            React.createElement('div', { className: 'col-xs-8' },
              React.createElement('h4', { className: 'panel-title payroll-title' },
                React.createElement('a',
                  {
                    role: 'button',
                    href: '#' + collapseId,
                    'data-toggle': 'collapse',
                    'data-parent': this.props.parent,
                    'aria-expanded': '' + expanded,
                    'aria-controls': collapseId
                  },
                  address
                )
              ),
              React.createElement('span', {},
                'From ' + formatDateTime(payroll.fromTimestamp) +
                (payroll.toTimestamp ? ' until ' + formatDateTime(payroll.toTimestamp) : '')
              )
            ),
            React.createElement('div', { className: 'col-xs-4' },
              React.createElement('div', { className: 'pull-right' },
                isDirector && React.createElement(LockPayrollButton, {
                  selectedAccount: selectedAccount,
                  payroll: payroll
                }),
                isDirector && React.createElement(ProcessPayrollButton, {
                  selectedAccount: selectedAccount,
                  payroll: payroll,
                  processingPayroll: processingPayroll
                }),
                React.createElement(PayrollStatus, {
                  payroll: payroll
                })
              )
            )
          )
        ),
        React.createElement('div',
          {
            id: collapseId,
            role: 'tabpanel',
            className: 'panel-collapse collapse' + (expanded ? ' in' : ''),
            'aria-labelledby': headingId
          },
          React.createElement('div', { className: 'panel-body' },
            React.createElement(PayrollContent, { payroll: payroll })
          )
        )
      );
    }
  });

  var PayrollAccordion = React.createClass({
    propTypes: {
      selectedAccount: React.PropTypes.object,
      payrolls: React.PropTypes.array,
      processingPayroll: React.PropTypes.bool
    },
    render: function() {
      var accordionId = 'payroll-accordion';
      var selectedAccount = this.props.selectedAccount;
      var processingPayroll = this.props.processingPayroll;
      return React.createElement('div',
        {
          id: accordionId,
          role: 'tablist',
          className: 'panel-group',
          'aria-multiselectable': 'true'
        },
        this.props.payrolls.map(function(payroll, idx) {
          return React.createElement(PayrollPanel, {
            key: payroll.address,
            selectedAccount: selectedAccount,
            payroll: payroll,
            processingPayroll: processingPayroll,
            parent: '#' + accordionId
          });
        })
      );
    }
  });

  var MainComponent = React.createClass({
    propTypes: {
      state: React.PropTypes.object.isRequired
    },
    render: function() {
      var state = this.props.state;
      if (_.isEmpty(state)) {
        return React.createElement(LoadingScreen, {},
          'Initializing Ethereum...'
        );
      } else if (state.accountsLoading || state.payrollsLoading) {
        return React.createElement(LoadingScreen, {},
          'Fetching data...'
        );
      } else {
        return React.createElement('div', { className: 'container' },
          React.createElement(Header),
          React.createElement('h3', {}, 'Account Information'),
          React.createElement(AccountSelector, {
            accounts: state.accounts,
            selectedAccount: state.selectedAccount
          }),
          React.createElement(HourMarker, {
            selectedAccount: state.selectedAccount,
            markingHours: state.markingHours
          }),
          React.createElement('h3', {}, 'Monthly Payrolls'),
          React.createElement(PayrollAccordion, {
            selectedAccount: state.selectedAccount,
            payrolls: _.reverse(_.values(state.payrolls)),
            processingPayroll: state.processingPayroll
          })
        );
      }
    }
  });

  context.MainComponent = MainComponent;
})(window);
