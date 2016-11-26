const _ = require('lodash/fp');
const axios = require('axios');
const config = require('./config');

if (!config.FUM_TOKEN || !config.FUM_BASEURL) {
  throw new Error('No FUM token or host set in config');
}
axios.defaults.baseURL = config.FUM_BASEURL;
axios.defaults.headers.common['Authorization'] = `Token ${config.FUM_TOKEN}`;

function isFUMUser(username) {
  return axios.get(`/users/${username}/`)
    .then(() => true, () => false);
}

function getFUMUser(username) {
  return axios.get(`/users/${username}/`)
    .then(res => _.pick([
      'id',
      'username',
      'first_name',
      'last_name',
      'physical_office',
      'hr_number'
    ], res.data));
}

exports.isUser = isFUMUser;
exports.getUser = getFUMUser;
