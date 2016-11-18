(function() {
  var hoursEvents = [];
  var hoursPending = {};

  function eventComparator(a, b) {
    if (a.blockNumber != b.blockNumber) {
      return (a.blockNumber - b.blockNumber);
    }
    return (a.logIndex - b.logIndex);
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
    $.getJSON('/api/hours/events', function(data) {
      data.forEach(function(event) {
        addHoursEvent(event);
      });
      updateEventList();
    });
    $.getJSON('/api/hours/pending', function(data) {
      data.forEach(function(tx) {
        hoursPending[tx.hash] = tx;
      });
      updateEventList();
    });
  }

  function updateEventList() {
    var elems = hoursEvents.map(function(event) {
      return '<li class="list-group-item">' + JSON.stringify(event) + '</li>';
    });
    var pending = Object.values(hoursPending).map(function(tx) {
      return '<li class="list-group-item">' + JSON.stringify(tx) + '</li>';
    });
    $('ul.list-group').html(elems.join('') + pending.join(''));
  }

  $(document).ready(function() {
    fetchInitial();
    $('button').click(function(event) {
      var data = {
        description: 'foobar',
        duration: 3600
      };
      $.ajax({
        type: 'POST',
        url: '/api/hours/jvah',
        data: JSON.stringify(data),
        dataType: 'json',
        contentType: 'application/json',
        processData: false
      });
    });

    var socket = io();
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
  });
})();
