const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const exphbs = require('express-handlebars');
const eth = require('./eth');
const eventapi = require('./eventapi');
const restapi = require('./restapi');

const app = express();
const server = http.Server(app);
const io = require('socket.io')(server);

app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');

app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use('/api/', restapi);

app.get('/', (req, res) => {
  res.render('hours');
});

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
