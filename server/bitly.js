const Bitly = require('bitly');
const config = require('./config');

if (!config.BITLY_TOKEN) {
  throw new Error('No Bitly token set in config');
}
const bitly = new Bitly(config.BITLY_TOKEN);

function shortenURL(url) {
  return bitly.shorten(url).then(res => res.data.url);
}

exports.shortenURL = shortenURL;
