module.exports = {
  build: {
    "index.html": "index.html",
    "app.js": [
      "javascripts/app.js"
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "images/": "images/"
  },
  rpc: {
    host: "localhost",
    port: 8545
  },
  networks: {
    "live": {
      network_id: 1
    },
    "morden": {
      network_id: 2,
      gas: 3141592
    },
    "development": {
      network_id: "default"
    }
  }
};
