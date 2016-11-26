(function() {
  var hoursEvents = [];
  var hoursPending = {};
  var ratesPending = {};

  // See https://gist.github.com/dperini/729294
  var urlRegex = /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?$/i

  var dateFormatter = new Intl.DateTimeFormat([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric' });

  var EventItem = React.createClass({
    propTypes: {
      event: React.PropTypes.object.isRequired
    },
    render: function() {
      var event = this.props.event;
      var date = dateFormatter.format(event.block ? new Date(event.block.timestamp * 1000) : new Date());
      var name = (event.user ? event.user.first_name + ' ' + event.user.last_name : event.args.info);
      var descr = urlRegex.test(event.args.description)
        ? React.createElement('a', { href: event.args.description }, event.args.description)
        : event.args.description;
      if (event.event === 'MarkHours') {
        return React.createElement('li', { key: eventId(event) },
          date + ' ' + name + ' marked ' + moment.duration(event.args.duration*1000).humanize() + ' to project ', descr,
          (event.args.success ? '' : ' FAILED')
        );
      } else if (event.event === 'ProcessPayroll') {
        return React.createElement('li', { key: eventId(event) },
          date + ' Payroll was processed, started new payroll'
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
      events: React.PropTypes.array.isRequired
    },
    render: function() {
      var children = this.props.events.map(function(event) {
        return React.createElement(EventItem, { event: event });
      });
      return React.createElement.apply(this, ['ul', {}].concat(children));
    }
  });

  var TxPending = React.createClass({
    propTypes: {
      transactions: React.PropTypes.object.isRequired
    },
    render: function() {
      var txCount = Object.keys(this.props.transactions).length;
      if (txCount > 0) {
        return React.createElement('div', { className: 'pending' },
          txCount + ' transactions pending, please wait');
      } else {
        return React.createElement('div', {},
          'No transactions pending, everything up-to-date');
      }
    }
  });

  var HoursForm = React.createClass({
    getInitialState: function() {
      return {
        hours: 1,
        title: '',
        description: ''
      };
    },
    hoursChanged: function(event) {
      this.state.hours = event.target.value;
      this.forceUpdate();
    },
    isTitleValid: function() {
      return (this.state.title.length <= 32 || urlRegex.test(this.state.title));
    },
    titleChanged: function(event) {
      this.state.title = event.target.value;
      this.forceUpdate();
    },
    descriptionChanged: function(event) {
      this.state.title = event.target.value;
      this.forceUpdate();
    },
    sendMarking: function() {
      postJSON('/api/hours/jvah', {
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

  function eventComparator(a, b) {
    if (b.blockNumber != a.blockNumber) {
      return (b.blockNumber - a.blockNumber);
    }
    return (b.logIndex - a.logIndex);
  }

  function eventId(e) {
    return e.blockHash + ':' + e.logIndex;
  }

  function addHoursEvent(event) {
    for (var i = 0; i < hoursEvents.length; i++) {
      // If event already exists, do not re-add it
      if (eventId(hoursEvents[i]) === eventId(event)) {
        return;
      }
    }
    hoursEvents.push(event);
    hoursEvents.sort(eventComparator);
  }

  function fetchInitial() {
    getJSON('/api/hours/events', function(err, data) {
      data.forEach(function(event) {
        addHoursEvent(event);
      });
      updateEventList();
    });
    getJSON('/api/hours/pending', function(err, data) {
      data.forEach(function(tx) {
        hoursPending[tx.hash] = tx;
      });
      updateEventList();
    });
  }

  function updateEventList() {
    var hoursForm = React.createElement(HoursForm, {});
    ReactDOM.render(hoursForm, document.getElementById('hours-form'));
    var eventList = React.createElement(EventList, { events: hoursEvents });
    ReactDOM.render(eventList, document.getElementById('event-list'));
    var txPending = React.createElement(TxPending, { transactions: hoursPending });
    ReactDOM.render(txPending, document.getElementById('transaction-status'));
  }

  var spinIcon = _.throttle(function() {
    var icon = document.getElementById('chilicorn-icon');
    icon.className = 'spin';
    setTimeout(function() {
      icon.className = '';
    }, 600);
    
  }, 1000, {trailing: false});

  fetchInitial();

  var socket = io();
  socket.on('block', function(msg) {
    console.log('block: ' + msg);
  });
  socket.on('rates/pending', function(msg) {
    console.log('rates pending: ' + msg);
    const tx = JSON.parse(msg);
    ratesPending[tx.hash] = tx;
  });
  socket.on('rates/tx', function(msg) {
    console.log('rates tx: ' + msg);
    const tx = JSON.parse(msg);
    delete ratesPending[tx.hash];
  });
  socket.on('hours/pending', function(msg) {
    console.log('hours pending: ' + msg);
    const tx = JSON.parse(msg);
    hoursPending[tx.hash] = tx;
    updateEventList();
  });
  socket.on('hours/tx', function(msg) {
    console.log('hours tx: ' + msg);
    const tx = JSON.parse(msg);
    delete hoursPending[tx.hash];
    updateEventList();
  });
  socket.on('hours/receipt', function(msg) {
    console.log('hours receipt: ' + msg);
  });
  socket.on('hours/event', function(msg) {
    console.log('hours event: ' + msg);
    const event = JSON.parse(msg);
    addHoursEvent(event);
    updateEventList();
    spinIcon();
  });
})();
