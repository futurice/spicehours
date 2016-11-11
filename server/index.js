var express = require('express');
var api = require('./api');

var app = express();

app.use(express.static(__dirname + '/public'));
app.use('/api/', api);

app.listen(3000);
