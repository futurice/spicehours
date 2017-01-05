//// TRUFFLE BOOTSTRAP

Object.keys(__contracts__).forEach(function(contract_name) {
  window[contract_name] = __contracts__[contract_name];
});

window.addEventListener('load', function() {
  // Supports Mist, and other wallets that provide 'web3'.
  if (typeof web3 !== 'undefined') {
    // Use the Mist/wallet provider.
    window.web3 = new Web3(web3.currentProvider);
  } else {
    // Use the default provider.
    window.web3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io'));
  }

  Object.keys(__contracts__).forEach(function(contract_name) {
    window[contract_name].setProvider(window.web3.currentProvider);
  });
});

//// END TRUFFLE BOOTSTRAP
