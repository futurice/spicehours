const axios = require('axios');
const config = require('./config');

if (!config.FUM_TOKEN || !config.FUM_BASEURL) {
  throw new Error('No FUM token or host set in config');
}
axios.defaults.baseURL = config.FUM_BASEURL;
axios.defaults.headers.common['Authorization'] = `Token ${config.FUM_TOKEN}`;

function getUser(username) {
  return axios.get(`/users/${username}/`)
    .then(res => res.data);
}

exports.getUser = getUser;
