var express = require('express');
var bodyParser = require('body-parser');
var eth = require('./eth');
var ethapi = require('./ethapi');
var api = require('./api');

var app = express();

app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use('/api/', ethapi);
app.use('/api/', api);

eth.prepare()
  .then(() => {
    const port = process.env.PORT || 3000;
    console.log(`Listening to port ${port}`);
    app.listen(port);
  })
  .catch(err => {
    console.log(err);
  });
