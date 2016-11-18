function fetchEvents() {
  $.getJSON('/api/hours/jvah/events', function(data) {
    var elems = data.map(function(val) {
      return '<li class="list-group-item">' + JSON.stringify(val) + '</li>';
    });
    $('ul.list-group').html(elems.join(''));
  });
}

$(document).ready(function() {
  fetchEvents();
  $('button').click(function(event) {
    var data = {
      description: 'foobar',
      duration: 3600
    };
    $.ajax({
      type: 'POST',
      url: '/api/hours/jvah',
      data: JSON.stringify(data),
      success: fetchEvents,
      dataType: 'json',
      contentType: 'application/json',
      processData: false
    });
  });

  var socket = io();
  socket.on('hours/pending', function(msg) {
    console.log('hours pending: ' + msg);
  });
  socket.on('hours/tx', function(msg) {
    console.log('hours tx: ' + msg);
  });
  socket.on('hours/receipt', function(msg) {
    console.log('hours receipt: ' + msg);
  });
});
