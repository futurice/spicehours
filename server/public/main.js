(function() {
  var hoursEvents = [];
  var hoursPending = {};
  var ratesPending = {};

  var EventItem = React.createClass({
    propTypes: {
      event: React.PropTypes.object.isRequired
    },
    render: function() {
      var event = this.props.event;
      return React.createElement('li', { key: eventId(this.props.event) },
        'Marking from ' + event.args.info +
        ' description ' + event.args.description +
        ' duration ' + event.args.duration
      );
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

  function eventComparator(a, b) {
    if (a.blockNumber != b.blockNumber) {
      return (a.blockNumber - b.blockNumber);
    }
    return (a.logIndex - b.logIndex);
  }

  function eventId(e) {
    return e.blockHash + ':' + e.logIndex;
  }

  function addHoursEvent(event) {
    for (var i = 0; i < hoursEvents.length; i++) {
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
    var eventList = React.createElement(EventList, { events: hoursEvents });
    ReactDOM.render(eventList, document.getElementById('event-list'));
    var txPending = React.createElement(TxPending, { transactions: hoursPending });
    ReactDOM.render(txPending, document.getElementById('transaction-status'));
  }

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
  });
})();
