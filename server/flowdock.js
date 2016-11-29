const axios = require('axios');
const winston = require('winston');
const bitly = require('./bitly');
const config = require('./config');
const common = require('./common');

const client = axios.create({
  baseURL: 'https://api.flowdock.com/v1',
  headers: { 'X-flowdock-wait-for-message': 'true' }
});

function formatDuration(duration) {
  var str = Math[duration > 0 ? 'floor' : 'ceil'](duration / 3600) + ' hours';
  if ((duration % 3600) !== 0) {
    str += ' ' + Math.round((duration % 3600) / 60) + ' minutes';
  }
  return str;
}

function sendMarking(user='unknown', title='', duration, description='', transaction) {
  console.log('sending marking');
  if (!config.FLOWDOCK_TOKEN) {
    winston.warn(`Flowdock token not found, not sending event to inbox: ${JSON.stringify(user)} ${JSON.stringify(title)} ${duration} ${description}`);
    return Promise.resolve();
  }

  let bitlyPromise = Promise.resolve();
  if (common.urlRegex.test(title)) {
    bitlyPromise = bitly.linkInfo(title).then(data => data.info[0]);
  }

  return bitlyPromise.then(info => {
    // The title can also be a bitly response object, in which case we use HTML title
    const titlestr = info ? info.title ? info.title : '' : title;
    const userstr = typeof(user) === 'string' ? user : `${user.first_name} ${user.last_name}`;
    const titlerow = titlestr ? `<b>Project:</b> ${titlestr}<br>` : '';
    const linkrow = info ? `<b>Link:</b> ${info.short_url}<br>` : '';
    const durationstr = formatDuration(duration);
    const transactionrow = transaction ? `<b>Transaction:</b> <a href="https://etherscan.io/tx/${transaction}">${transaction}</a><br>` : '';
    const descriptionrow = description ? `<b>Description:</b><br>${description.replace(/\n/g, '<br>')}` : '';
    return client.post('/messages', {
      flow_token: config.FLOWDOCK_TOKEN,
      event: 'mail',
      tags: [],
      source: 'SpiceHours',
      from_address: config.FLOWDOCK_FROM,
      from_name: 'SpiceHours',
      subject: `${userstr} marked ${formatDuration(duration)}`,
      content: `${titlerow}${linkrow}<b>Duration:</b> ${formatDuration(duration)}<br>${transactionrow}${descriptionrow}`
    })
  }).catch(err => winston.err(`Could not send information to flowdock: ${JSON.stringify(user)} ${JSON.stringify(title)} ${duration} ${description}`));
}

exports.sendMarking = sendMarking;
