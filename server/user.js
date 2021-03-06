const _ = require('lodash/fp');
const axios = require('axios');
const winston = require('winston');
const config = require('./config');
let staticEmployees = null;
try {
  staticEmployees = require('./employees.json');
} catch(e) {}


const hasFumCredentials = config.FUM_USERNAME && config.FUM_PASSWORD;
const hasFumToken = config.FUM_TOKEN;
if ((!hasFumCredentials && !hasFumToken) || !config.FUM_BASEURL) {
  throw new Error('No FUM username, password or token or host set in config');
}

function createWithCredentials() {
  if (!hasFumCredentials) {
    throw new Error("createWithCredentials: panic!");
  }

  return axios.create({
    baseURL: config.FUM_BASEURL,
    timeout: 5000,
    auth: {
      username: config.FUM_USERNAME,
      password: config.FUM_PASSWORD
    }
  });
}

function createWithToken() {
  if (!hasFumToken) {
    throw new Error("createWithToken: panic!");
  }

  return axios.create({
    baseURL: config.FUM_BASEURL,
    timeout: 5000,
    headers: {
      Authorization: config.FUM_TOKEN,
    }
  });
}

const client = hasFumCredentials ? createWithCredentials() : createWithToken();

function isFUMUser(username) {
  return getFUMUser(username)
    .then(user => !!user);
}

function fetchEmployees() {
  return client.get(`/list/employees/`)
    .then(res => res.data);
}

let employeesCache = staticEmployees;
function enableCacheInvalidation(interval) {
  function updateCache() {
    winston.info('Updating user cache');
    fetchEmployees().then(employees => {
      if (Array.isArray(employees)) {
        employeesCache = employees;
        winston.info('Updated user cache');
      } else {
        winston.info('Did not update cache because of invalid data');
      }
    });
    setTimeout(updateCache, interval);
  }
  updateCache();
}
enableCacheInvalidation(900000); // 15 minutes cache

function getFUMUser(username) {
  let employeesPromise;
  if (Array.isArray(employeesCache)) {
    employeesPromise = Promise.resolve(employeesCache);
  } else if (employeesCache) {
    employeesPromise = employeesCache;
  } else {
    winston.info(`Fetching FUM employees from the server`);
    employeesPromise = employeesCache = fetchEmployees()
      .catch(err => {
        employeesCache = null;
        return Promise.reject(err);
      });
  }
  return employeesPromise
    .then(employees => _.find(employee => employee.username === username, employees))
    .then(employee => _.pick([
        'id',
        'username',
        'first_name',
        'last_name',
        'physical_office',
        'hr_number'
      ], employee));
}

exports.isUser = isFUMUser;
exports.getUser = getFUMUser;
