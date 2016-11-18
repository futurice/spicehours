var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
var eth = require('./eth');
var eventapi = require('./eventapi');
var api = require('./api');

var app = express();
var server = http.Server(app);
var io = require('socket.io')(server);

app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use('/api/', api);

eth.prepare()
  .then(() => eventapi.attach(io))
  .then(() => {
    const port = process.env.PORT || 3000;
    console.log(`Listening to port ${port}`);
    server.listen(port);
  })
  .catch(err => {
    console.log(err);
  });
