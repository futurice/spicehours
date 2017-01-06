(function(context) {
  var PayrollContent = React.createClass({
    propTypes: {
      payroll: React.PropTypes.object.isRequired
    },
    render: function() {
      var entries = this.props.payroll.entries;
      var processed = this.props.payroll.processed;
      if (!entries) {
        return React.createElement('div', {}, 'Loading...');
      }

      return React.createElement('table', { className: 'table' },
        React.createElement('thead', {},
          React.createElement('tr', {},
            React.createElement('th', {}, 'User'),
            React.createElement('th', {}, 'Duration'),
            processed && React.createElement('th', {}, 'Payout')
          )
        ),
        React.createElement('tbody', {},
          entries.map(function(entry) {
            return React.createElement('tr', { key: entry.info },
              React.createElement('td', {}, entry.info.substr(2, 8)),
              React.createElement('td', {}, entry.duration),
              processed && React.createElement('td', {}, entry.payout)
            );
          })
        )
      );
    }
  });

  var PayrollPanel = React.createClass({
    propTypes: {
      payroll: React.PropTypes.object.isRequired,
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
      var payroll = this.props.payroll;
      var expanded = !!this.props.expanded;

      var address = payroll.address;
      var headingId = 'heading-' + address;
      var collapseId = 'collapse-' + address;
      return React.createElement('div', { className: 'panel panel-default' },
        React.createElement('div', { id: headingId, className: 'panel-heading', role: 'tab' },
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
      payrolls: React.PropTypes.array
    },
    render: function() {
      var accordionId = 'payroll-accordion';
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
            payroll: payroll,
            parent: '#' + accordionId
          });
        })
      );
    }
  });

  var Main = React.createClass({
    propTypes: {
      state: React.PropTypes.object.isRequired
    },
    render: function() {
      return React.createElement('div', { className: 'container' },
        React.createElement(PayrollAccordion, {
          payrolls: _.reverse(_.values(this.props.state.payrolls))
        })
      );
    }
  });

  context.Components = {
    PayrollPanel: PayrollPanel,
    PayrollAccordion: PayrollAccordion,
    Main: Main
  };
})(window);
