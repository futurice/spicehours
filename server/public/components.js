(function() {
  // See https://gist.github.com/dperini/729294
  var urlRegex = /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?$/i

  var dateFormatter = new Intl.DateTimeFormat([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric' });

  function eventId(e) {
    return e.blockHash + ':' + e.logIndex;
  }

  var EventItem = React.createClass({
    propTypes: {
      event: React.PropTypes.object.isRequired,
      latestBlock: React.PropTypes.object
    },
    render: function() {
      var event = this.props.event;
      var date = dateFormatter.format(event.block ? new Date(event.block.timestamp * 1000) : new Date());
      var name = (event.user ? event.user.first_name + ' ' + event.user.last_name : event.args.info);
      var descr = urlRegex.test(event.args.description)
        ? React.createElement('a', { href: event.args.description, target: '_blank', rel: 'noopener noreferrer' }, event.args.description)
        : event.args.description;
      var latestBlock = this.props.latestBlock;
      var confirm = (latestBlock && event.block) ? ' ' + (latestBlock.number - event.block.number) + ' confirmations' : null;
      if (event.event === 'MarkHours') {
        return React.createElement('li', { key: eventId(event) },
          React.createElement('div', {}, date, (confirm ? ', ' + confirm : '')),
          React.createElement('div', {},
            name + ' marked ' + moment.duration(event.args.duration*1000).humanize() + ' to project ', descr,
            (event.args.success ? '' : ' FAILED')
          )
        );
      } else if (event.event === 'ProcessPayroll') {
        return React.createElement('li', { key: eventId(event) },
          React.createElement('div', {}, date, (confirm ? ', ' + confirm : '')),
          React.createElement('div', {},
            'Processed ',
            React.createElement('a', { href: '/payrolls/' + event.args.payroll }, 'payroll'),
            ' capping all markings to ' + (event.args.maxDuration / 3600) + ' hours'
          )
        );
      } else if (event.event === 'CreatePayroll') {
        return React.createElement('li', { key: eventId(event) },
          React.createElement('div', {}, date, (confirm ? ', ' + confirm : '')),
          React.createElement('div', {},
            'Created new ',
            React.createElement('a', { href: '/payrolls/' + event.args.payroll }, 'payroll'),
            ' for hour markings'
          )
        );
      } else {
        return React.createElement('li', { key: eventId(event) },
          date + ' Unknown event ' + event.event
        );
      }
    }
  });

  var EventList = React.createClass({
    propTypes: {
      events: React.PropTypes.array.isRequired,
      latestBlock: React.PropTypes.object
    },
    render: function() {
      var latestBlock = this.props.latestBlock;
      var children = this.props.events.map(function(event) {
        return React.createElement(EventItem, { event: event, latestBlock: latestBlock });
      });
      return React.createElement.apply(this, ['ul', {}].concat(children));
    }
  });

  var StatusBar = React.createClass({
    propTypes: {
      transactions: React.PropTypes.object.isRequired,
      error: React.PropTypes.string
    },
    render: function() {
      var txCount = Object.keys(this.props.transactions).length;
      if (this.props.error) {
        return React.createElement('div', { className: 'error' }, this.props.error);
      } else if (txCount > 0) {
        return React.createElement('div', { className: 'pending' },
          txCount + ' transactions pending, please wait');
      } else {
        return React.createElement('div', {},
          'No transactions pending, everything up-to-date');
      }
    }
  });

  var HoursForm = React.createClass({
    propTypes: {
      sendCallback: React.PropTypes.func.isRequired,
      errorCallback: React.PropTypes.func.isRequired
    },
    getInitialState: function() {
      return {
        hours: 1,
        title: '',
        description: ''
      };
    },
    hoursChanged: function(event) {
      this.setState({ hours: event.target.value });
    },
    isTitleValid: function() {
      return (this.state.title.length <= 32 || urlRegex.test(this.state.title));
    },
    titleChanged: function(event) {
      this.setState({ title: event.target.value });
    },
    descriptionChanged: function(event) {
      this.setState({ description: event.target.value });
    },
    sendMarking: function() {
      if (!this.isTitleValid()) {
        return this.props.errorCallback(`Invalid title for hour marking, use less than 32 characters or an URL`);
      }
      this.props.sendCallback({
        duration: parseFloat(this.state.hours)*3600,
        description: this.state.title
      });
    },
    render: function() {
      var titleStyle = {};
      if (!this.isTitleValid()) {
        titleStyle['backgroundColor'] = '#ffcdd2';
      }
      return React.createElement('div', { className: 'hours-form' },
        React.createElement('label', { htmlFor: 'title' }, 'Title:'),
        React.createElement('input', {
          name: 'title',
          type: 'url',
          style: titleStyle,
          placeholder: 'Public title or link URL',
          defaultValue: this.state.title,
          onChange: this.titleChanged
        }),
        React.createElement('br'),
        React.createElement('label', { htmlFor: 'hours' }, 'Hours spent:'),
        React.createElement('input', {
          id: 'hours',
          type: 'number',
          step: 0.25,
          defaultValue: this.state.hours,
          onChange: this.hoursChanged
        }),
        React.createElement('br'),
        React.createElement('label', { htmlFor: 'description' }, 'Description:'),
        React.createElement('textarea', {
          name: 'description',
          placeholder: 'Private description, not shown publicly',
          onChange: this.descriptionChanged
        }),
        React.createElement('br'),
        React.createElement('label'),
        React.createElement('button', {
          id: 'send',
          htmlFor: 'send',
          onClick: this.sendMarking
        }, 'Send')
      );
    }
  });

  window.EventItem = EventItem;
  window.EventList = EventList;
  window.StatusBar = StatusBar;
  window.HoursForm = HoursForm;
})();
