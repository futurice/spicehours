module.exports = {
  build: {
    "index.html": "index.html",
    "app.js": {
      "files": [
        "javascripts/bootstrap.js",
        "javascripts/app.js"
      ],
      "post-process": [
        "include-contracts",
        "frontend-dependencies"
      ]
    },
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
      network_id: 1,
      gas: 3141592
    },
    "morden": {
      network_id: 2,
      gas: 3141592
    },
    "ropsten": {
      network_id: 3
    },
    "development": {
      network_id: "default"
    }
  }
};
