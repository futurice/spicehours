var express = require('express');
var bodyParser = require('body-parser');
var eth = require('./eth');
var api = require('./api');

var app = express();

app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use('/api/', api);

eth.prepare()
  .then(() => {
    app.listen(3000);
    console.log('Listening to ' + 3000);
  })
  .catch(err => {
    console.log(err);
  });
