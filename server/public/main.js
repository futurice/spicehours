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
    // First remove all duplicate events from hoursEvents array
    hoursEvents = hoursEvents.filter(function(oldEvent) {
      return (
        oldEvent.event !== event.event ||
        oldEvent.transactionHash !== event.transactionHash ||
        JSON.stringify(oldEvent.args) !== JSON.stringify(oldEvent.args)
      );
    });
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
    ReactDOM.render(eventList, document.getElementById('main-content'));
/*
    var $listEl = $('ul.list-group');
    var $events = hoursEvents.map(function(event) {
      if (event.event === 'MarkHours') {
        var eventInfo = '';
        eventInfo += 'Marking from ' + event.args.info;
        eventInfo += ' description ' + event.args.description;
        eventInfo += ' duration ' + event.args.duration;
        return $('<li>').addClass('list-group-item').text(eventInfo);
      }
    });
    $listEl.empty().append($events);
    var pendingLength = Object.keys(hoursPending).length;
    if (pendingLength > 0) {
      $listEl.append($('<li>').addClass('list-group-item').text(pendingLength + ' transactions pending'));
    }
*/
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
