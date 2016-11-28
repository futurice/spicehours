const _ = require('lodash/fp');
const axios = require('axios');
const winston = require('winston');
const config = require('./config');

if (!config.FUM_TOKEN || !config.FUM_BASEURL) {
  throw new Error('No FUM token or host set in config');
}
const client = axios.create({
  baseURL: config.FUM_BASEURL,
  headers: { 'Authorization': `Token ${config.FUM_TOKEN}` }
});

function isFUMUser(username) {
  return getFUMUser(username)
    .then(() => true, () => false);
}

let userCache = {};
function enableCacheInvalidation(interval) {
  function clearCache() {
    winston.info('Clearing user cache');
    userCache = {};
    setTimeout(clearCache, interval);
  }
  clearCache();
}
enableCacheInvalidation(900000); // 15 minutes cache

function getFUMUser(username) {
  const cachedUser = userCache[username];
  if (cachedUser) {
    return cachedUser;
  } else {
    winston.debug(`Fetching FUM user ${username} from the server`);
    userCache[username] = client.get(`/users/${username}/`)
      .then(res => _.pick([
        'id',
        'username',
        'first_name',
        'last_name',
        'physical_office',
        'hr_number'
      ], res.data));
    return userCache[username];
  }
}

exports.isUser = isFUMUser;
exports.getUser = getFUMUser;
