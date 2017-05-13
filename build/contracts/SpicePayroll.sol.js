var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("SpicePayroll error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("SpicePayroll error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("SpicePayroll contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of SpicePayroll: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to SpicePayroll.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: SpicePayroll not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "1": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "entryCount",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "processed",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_index",
            "type": "uint256"
          }
        ],
        "name": "entryInfo",
        "outputs": [
          {
            "name": "",
            "type": "bytes32"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_calculator",
            "type": "address"
          },
          {
            "name": "_maxDuration",
            "type": "uint256"
          }
        ],
        "name": "processMarkings",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "toBlock",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          }
        ],
        "name": "duration",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "unlock",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          },
          {
            "name": "_duration",
            "type": "uint256"
          }
        ],
        "name": "modifyMarking",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          },
          {
            "name": "_description",
            "type": "bytes32"
          },
          {
            "name": "_duration",
            "type": "int256"
          }
        ],
        "name": "addMarking",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "locked",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          }
        ],
        "name": "payout",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "fromBlock",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "lock",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_members",
            "type": "address"
          }
        ],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "creator",
            "type": "address"
          }
        ],
        "name": "NewPayroll",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          }
        ],
        "name": "FailedMarking",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          }
        ],
        "name": "AddMarking",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ProcessMarkings",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "calculator",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "maxDuration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "fromBlock",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "toBlock",
            "type": "uint256"
          }
        ],
        "name": "AllMarkingsProcessed",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ModifyMarking",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "locked",
            "type": "bool"
          }
        ],
        "name": "SetPayrollLocked",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260405160208061094c83395060806040525180600080546c0100000000000000000000000080840204600160a060020a031990911617905550600180546c010000000000000000000000003381810291909104600160a060020a03199092169190911790915543600255604051600160a060020a03909116907f9709d040ed4aab7028d46f8532940a2230d99b95e8e5dffd6c62c36919f3962290600090a25061089a806100b26000396000f3606060405236156100a35760e060020a60003504630cbb0f8381146100a85780632ce5c284146100b757806339464884146100d257806361064b5a146101015780639700659114610133578063a37ba32a14610141578063a69df4b514610164578063c7c0c5bf146101f7578063cd8ed6f614610299578063cf309012146102ca578063cfefb3d5146102e3578063ed6a6d2814610305578063f83d08ba14610313575b610002565b34610002576103246005545b90565b3461000257610336600654600160a060020a031615156100b4565b34610002576103246004356000600560005082815481101561000257600091825260209091200154905061015f565b346100025761034a60043560243560015460009081908190819033600160a060020a0390811691161461034c57610002565b346100025761032460035481565b34610002576103246004356000818152600460205260409020600101545b919050565b346100025761034a61050b335b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a03848116911614915061015f9050565b346100025761034a6004356024356000610576335b60006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f115610002575050604051519190911015905080610893575061089382610171565b3461000257610336600435602435604435600154600090819033600160a060020a0390811691161461069357610002565b346100025761033660065460ff60a060020a9091041681565b346100025761032460043560008181526004602052604090206003015461015f565b346100025761032460025481565b346100025761034a6108233361020c565b60408051918252519081900360200190f35b604080519115158252519081900360200190f35b005b600654600160a060020a03161561036257610002565b6006805473ffffffffffffffffffffffffffffffffffffffff19166c0100000000000000000000000088810204179055600093505b6005548410156103e557600580548590811015610002579060005260206000209001600050546000818152600460205260409020600181015491945092509050848111156104445784610446565b436003819055600254604080518881526020810192909252818101929092529051600160a060020a038816917f593f3a6ca687633736d25531fb6f6fc7bd990ef6f1b7fb2c69cdf35a246e372e919081900360600190a2505050505050565b805b600183018190556006546040805160006020918201819052825160e060020a63e2b863cf0281526004810189905260248101959095529151600160a060020a039093169363e2b863cf9360448083019491928390030190829087803b156100025760325a03f11561000257505060408051805160038601819055600186015485835260208301528183015290518592507fe6ce162265809f487ca530c8f318b648987fd7dfec923edcc424d43ff53ffbb79181900360600190a2600190930192610397565b151561051657610002565b6006805474ff00000000000000000000000000000000000000001916908190556040805160a060020a90920460ff1615158252517fe85392445b5aa5368f61c68ea222f92bf5526e9f871142576e9a55dde7b56f0e9181900360200190a1565b151561058157610002565b600654600160a060020a0316151561059857610002565b60065460a060020a900460ff16156105af57610002565b60008381526004602052604090205460ff1615156105cc57610002565b5060008281526004602081815260408084206001810186905560065482518401869052825160e060020a63e2b863cf0281529485018890526024850187905291519094600160a060020a039092169363e2b863cf936044808301949193928390030190829087803b156100025760325a03f1156100025750506040805180516003850181905560018501548252602082015281518693507f5e763377c074567f93d6dbd49375bcea31d0ad895345b0ffa9aaed6f11106fbf929181900390910190a2505050565b600654600160a060020a0316156106a957610002565b6000831280156106cd57506000858152600460205260408120600101549084900390105b15610788576000858152600460209081526040918290206001015482519081529081018590528151869288927f842b8efac3852ccf2dc466623aa8eeaea245436ed889aa2ed22b8689997a7875929081900390910190a360009150610780565b600181018054840190555b60018101546040805185815260208101929092528051869288927fd9d0b091aebb6b491de28bb7faa8691ab87deafdb5753a532063f347052ff08e92918290030190a3600191505b509392505050565b506000848152600460205260409020805460ff16151561080257805460ff1916600190811782556005805491820180825590919082818380158290116107ef576000838152602090206107ef9181019083015b8082111561081f57600081556001016107db565b5050506000928352506020909120018590555b600083121561072d57600181018054600085900390039055610738565b5090565b151561082e57610002565b6006805474ff0000000000000000000000000000000000000000191660a060020a90811791829055604080519190920460ff161515815290517fe85392445b5aa5368f61c68ea222f92bf5526e9f871142576e9a55dde7b56f0e9181900360200190a1565b905061015f56",
    "events": {
      "0x9709d040ed4aab7028d46f8532940a2230d99b95e8e5dffd6c62c36919f39622": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "creator",
            "type": "address"
          }
        ],
        "name": "NewPayroll",
        "type": "event"
      },
      "0x842b8efac3852ccf2dc466623aa8eeaea245436ed889aa2ed22b8689997a7875": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          }
        ],
        "name": "FailedMarking",
        "type": "event"
      },
      "0xd9d0b091aebb6b491de28bb7faa8691ab87deafdb5753a532063f347052ff08e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          }
        ],
        "name": "AddMarking",
        "type": "event"
      },
      "0xe6ce162265809f487ca530c8f318b648987fd7dfec923edcc424d43ff53ffbb7": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ProcessMarkings",
        "type": "event"
      },
      "0x593f3a6ca687633736d25531fb6f6fc7bd990ef6f1b7fb2c69cdf35a246e372e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "calculator",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "maxDuration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "fromBlock",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "toBlock",
            "type": "uint256"
          }
        ],
        "name": "AllMarkingsProcessed",
        "type": "event"
      },
      "0x5e763377c074567f93d6dbd49375bcea31d0ad895345b0ffa9aaed6f11106fbf": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ModifyMarking",
        "type": "event"
      },
      "0xe85392445b5aa5368f61c68ea222f92bf5526e9f871142576e9a55dde7b56f0e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "locked",
            "type": "bool"
          }
        ],
        "name": "SetPayrollLocked",
        "type": "event"
      }
    },
    "updated_at": 1483121475265,
    "links": {}
  },
  "3": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "entryCount",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "processed",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_index",
            "type": "uint256"
          }
        ],
        "name": "entryInfo",
        "outputs": [
          {
            "name": "",
            "type": "bytes32"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_calculator",
            "type": "address"
          },
          {
            "name": "_maxDuration",
            "type": "uint256"
          }
        ],
        "name": "processMarkings",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "toBlock",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          }
        ],
        "name": "duration",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "unlock",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          },
          {
            "name": "_duration",
            "type": "uint256"
          }
        ],
        "name": "modifyMarking",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          },
          {
            "name": "_description",
            "type": "bytes32"
          },
          {
            "name": "_duration",
            "type": "int256"
          }
        ],
        "name": "addMarking",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "locked",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          }
        ],
        "name": "payout",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "fromBlock",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "lock",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_members",
            "type": "address"
          }
        ],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "creator",
            "type": "address"
          }
        ],
        "name": "NewPayroll",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          }
        ],
        "name": "FailedMarking",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          }
        ],
        "name": "AddMarking",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ProcessMarkings",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "calculator",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "maxDuration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "fromBlock",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "toBlock",
            "type": "uint256"
          }
        ],
        "name": "AllMarkingsProcessed",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ModifyMarking",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "locked",
            "type": "bool"
          }
        ],
        "name": "SetPayrollLocked",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260405160208061094c83395060806040525180600080546c0100000000000000000000000080840204600160a060020a031990911617905550600180546c010000000000000000000000003381810291909104600160a060020a03199092169190911790915543600255604051600160a060020a03909116907f9709d040ed4aab7028d46f8532940a2230d99b95e8e5dffd6c62c36919f3962290600090a25061089a806100b26000396000f3606060405236156100a35760e060020a60003504630cbb0f8381146100a85780632ce5c284146100b757806339464884146100d257806361064b5a146101015780639700659114610133578063a37ba32a14610141578063a69df4b514610164578063c7c0c5bf146101f7578063cd8ed6f614610299578063cf309012146102ca578063cfefb3d5146102e3578063ed6a6d2814610305578063f83d08ba14610313575b610002565b34610002576103246005545b90565b3461000257610336600654600160a060020a031615156100b4565b34610002576103246004356000600560005082815481101561000257600091825260209091200154905061015f565b346100025761034a60043560243560015460009081908190819033600160a060020a0390811691161461034c57610002565b346100025761032460035481565b34610002576103246004356000818152600460205260409020600101545b919050565b346100025761034a61050b335b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a03848116911614915061015f9050565b346100025761034a6004356024356000610576335b60006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f115610002575050604051519190911015905080610893575061089382610171565b3461000257610336600435602435604435600154600090819033600160a060020a0390811691161461069357610002565b346100025761033660065460ff60a060020a9091041681565b346100025761032460043560008181526004602052604090206003015461015f565b346100025761032460025481565b346100025761034a6108233361020c565b60408051918252519081900360200190f35b604080519115158252519081900360200190f35b005b600654600160a060020a03161561036257610002565b6006805473ffffffffffffffffffffffffffffffffffffffff19166c0100000000000000000000000088810204179055600093505b6005548410156103e557600580548590811015610002579060005260206000209001600050546000818152600460205260409020600181015491945092509050848111156104445784610446565b436003819055600254604080518881526020810192909252818101929092529051600160a060020a038816917f593f3a6ca687633736d25531fb6f6fc7bd990ef6f1b7fb2c69cdf35a246e372e919081900360600190a2505050505050565b805b600183018190556006546040805160006020918201819052825160e060020a63e2b863cf0281526004810189905260248101959095529151600160a060020a039093169363e2b863cf9360448083019491928390030190829087803b156100025760325a03f11561000257505060408051805160038601819055600186015485835260208301528183015290518592507fe6ce162265809f487ca530c8f318b648987fd7dfec923edcc424d43ff53ffbb79181900360600190a2600190930192610397565b151561051657610002565b6006805474ff00000000000000000000000000000000000000001916908190556040805160a060020a90920460ff1615158252517fe85392445b5aa5368f61c68ea222f92bf5526e9f871142576e9a55dde7b56f0e9181900360200190a1565b151561058157610002565b600654600160a060020a0316151561059857610002565b60065460a060020a900460ff16156105af57610002565b60008381526004602052604090205460ff1615156105cc57610002565b5060008281526004602081815260408084206001810186905560065482518401869052825160e060020a63e2b863cf0281529485018890526024850187905291519094600160a060020a039092169363e2b863cf936044808301949193928390030190829087803b156100025760325a03f1156100025750506040805180516003850181905560018501548252602082015281518693507f5e763377c074567f93d6dbd49375bcea31d0ad895345b0ffa9aaed6f11106fbf929181900390910190a2505050565b600654600160a060020a0316156106a957610002565b6000831280156106cd57506000858152600460205260408120600101549084900390105b15610788576000858152600460209081526040918290206001015482519081529081018590528151869288927f842b8efac3852ccf2dc466623aa8eeaea245436ed889aa2ed22b8689997a7875929081900390910190a360009150610780565b600181018054840190555b60018101546040805185815260208101929092528051869288927fd9d0b091aebb6b491de28bb7faa8691ab87deafdb5753a532063f347052ff08e92918290030190a3600191505b509392505050565b506000848152600460205260409020805460ff16151561080257805460ff1916600190811782556005805491820180825590919082818380158290116107ef576000838152602090206107ef9181019083015b8082111561081f57600081556001016107db565b5050506000928352506020909120018590555b600083121561072d57600181018054600085900390039055610738565b5090565b151561082e57610002565b6006805474ff0000000000000000000000000000000000000000191660a060020a90811791829055604080519190920460ff161515815290517fe85392445b5aa5368f61c68ea222f92bf5526e9f871142576e9a55dde7b56f0e9181900360200190a1565b905061015f56",
    "events": {
      "0x9709d040ed4aab7028d46f8532940a2230d99b95e8e5dffd6c62c36919f39622": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "creator",
            "type": "address"
          }
        ],
        "name": "NewPayroll",
        "type": "event"
      },
      "0x842b8efac3852ccf2dc466623aa8eeaea245436ed889aa2ed22b8689997a7875": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          }
        ],
        "name": "FailedMarking",
        "type": "event"
      },
      "0xd9d0b091aebb6b491de28bb7faa8691ab87deafdb5753a532063f347052ff08e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          }
        ],
        "name": "AddMarking",
        "type": "event"
      },
      "0xe6ce162265809f487ca530c8f318b648987fd7dfec923edcc424d43ff53ffbb7": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ProcessMarkings",
        "type": "event"
      },
      "0x593f3a6ca687633736d25531fb6f6fc7bd990ef6f1b7fb2c69cdf35a246e372e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "calculator",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "maxDuration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "fromBlock",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "toBlock",
            "type": "uint256"
          }
        ],
        "name": "AllMarkingsProcessed",
        "type": "event"
      },
      "0x5e763377c074567f93d6dbd49375bcea31d0ad895345b0ffa9aaed6f11106fbf": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ModifyMarking",
        "type": "event"
      },
      "0xe85392445b5aa5368f61c68ea222f92bf5526e9f871142576e9a55dde7b56f0e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "locked",
            "type": "bool"
          }
        ],
        "name": "SetPayrollLocked",
        "type": "event"
      }
    },
    "updated_at": 1483125009170,
    "links": {}
  },
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "entryCount",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "processed",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_index",
            "type": "uint256"
          }
        ],
        "name": "entryInfo",
        "outputs": [
          {
            "name": "",
            "type": "bytes32"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_calculator",
            "type": "address"
          },
          {
            "name": "_maxDuration",
            "type": "uint256"
          }
        ],
        "name": "processMarkings",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "toBlock",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          }
        ],
        "name": "duration",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "unlock",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          },
          {
            "name": "_duration",
            "type": "uint256"
          }
        ],
        "name": "modifyMarking",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          },
          {
            "name": "_description",
            "type": "bytes32"
          },
          {
            "name": "_duration",
            "type": "int256"
          }
        ],
        "name": "addMarking",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "locked",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_info",
            "type": "bytes32"
          }
        ],
        "name": "payout",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "fromBlock",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "lock",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_members",
            "type": "address"
          }
        ],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "creator",
            "type": "address"
          }
        ],
        "name": "NewPayroll",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          }
        ],
        "name": "FailedMarking",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          }
        ],
        "name": "AddMarking",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ProcessMarkings",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "calculator",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "maxDuration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "fromBlock",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "toBlock",
            "type": "uint256"
          }
        ],
        "name": "AllMarkingsProcessed",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ModifyMarking",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "locked",
            "type": "bool"
          }
        ],
        "name": "SetPayrollLocked",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260405160208061094c83395060806040525180600080546c0100000000000000000000000080840204600160a060020a031990911617905550600180546c010000000000000000000000003381810291909104600160a060020a03199092169190911790915543600255604051600160a060020a03909116907f9709d040ed4aab7028d46f8532940a2230d99b95e8e5dffd6c62c36919f3962290600090a25061089a806100b26000396000f3606060405236156100a35760e060020a60003504630cbb0f8381146100a85780632ce5c284146100b757806339464884146100d257806361064b5a146101015780639700659114610133578063a37ba32a14610141578063a69df4b514610164578063c7c0c5bf146101f7578063cd8ed6f614610299578063cf309012146102ca578063cfefb3d5146102e3578063ed6a6d2814610305578063f83d08ba14610313575b610002565b34610002576103246005545b90565b3461000257610336600654600160a060020a031615156100b4565b34610002576103246004356000600560005082815481101561000257600091825260209091200154905061015f565b346100025761034a60043560243560015460009081908190819033600160a060020a0390811691161461034c57610002565b346100025761032460035481565b34610002576103246004356000818152600460205260409020600101545b919050565b346100025761034a61050b335b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a03848116911614915061015f9050565b346100025761034a6004356024356000610576335b60006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f115610002575050604051519190911015905080610893575061089382610171565b3461000257610336600435602435604435600154600090819033600160a060020a0390811691161461069357610002565b346100025761033660065460ff60a060020a9091041681565b346100025761032460043560008181526004602052604090206003015461015f565b346100025761032460025481565b346100025761034a6108233361020c565b60408051918252519081900360200190f35b604080519115158252519081900360200190f35b005b600654600160a060020a03161561036257610002565b6006805473ffffffffffffffffffffffffffffffffffffffff19166c0100000000000000000000000088810204179055600093505b6005548410156103e557600580548590811015610002579060005260206000209001600050546000818152600460205260409020600181015491945092509050848111156104445784610446565b436003819055600254604080518881526020810192909252818101929092529051600160a060020a038816917f593f3a6ca687633736d25531fb6f6fc7bd990ef6f1b7fb2c69cdf35a246e372e919081900360600190a2505050505050565b805b600183018190556006546040805160006020918201819052825160e060020a63e2b863cf0281526004810189905260248101959095529151600160a060020a039093169363e2b863cf9360448083019491928390030190829087803b156100025760325a03f11561000257505060408051805160038601819055600186015485835260208301528183015290518592507fe6ce162265809f487ca530c8f318b648987fd7dfec923edcc424d43ff53ffbb79181900360600190a2600190930192610397565b151561051657610002565b6006805474ff00000000000000000000000000000000000000001916908190556040805160a060020a90920460ff1615158252517fe85392445b5aa5368f61c68ea222f92bf5526e9f871142576e9a55dde7b56f0e9181900360200190a1565b151561058157610002565b600654600160a060020a0316151561059857610002565b60065460a060020a900460ff16156105af57610002565b60008381526004602052604090205460ff1615156105cc57610002565b5060008281526004602081815260408084206001810186905560065482518401869052825160e060020a63e2b863cf0281529485018890526024850187905291519094600160a060020a039092169363e2b863cf936044808301949193928390030190829087803b156100025760325a03f1156100025750506040805180516003850181905560018501548252602082015281518693507f5e763377c074567f93d6dbd49375bcea31d0ad895345b0ffa9aaed6f11106fbf929181900390910190a2505050565b600654600160a060020a0316156106a957610002565b6000831280156106cd57506000858152600460205260408120600101549084900390105b15610788576000858152600460209081526040918290206001015482519081529081018590528151869288927f842b8efac3852ccf2dc466623aa8eeaea245436ed889aa2ed22b8689997a7875929081900390910190a360009150610780565b600181018054840190555b60018101546040805185815260208101929092528051869288927fd9d0b091aebb6b491de28bb7faa8691ab87deafdb5753a532063f347052ff08e92918290030190a3600191505b509392505050565b506000848152600460205260409020805460ff16151561080257805460ff1916600190811782556005805491820180825590919082818380158290116107ef576000838152602090206107ef9181019083015b8082111561081f57600081556001016107db565b5050506000928352506020909120018590555b600083121561072d57600181018054600085900390039055610738565b5090565b151561082e57610002565b6006805474ff0000000000000000000000000000000000000000191660a060020a90811791829055604080519190920460ff161515815290517fe85392445b5aa5368f61c68ea222f92bf5526e9f871142576e9a55dde7b56f0e9181900360200190a1565b905061015f56",
    "events": {
      "0x9709d040ed4aab7028d46f8532940a2230d99b95e8e5dffd6c62c36919f39622": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "creator",
            "type": "address"
          }
        ],
        "name": "NewPayroll",
        "type": "event"
      },
      "0x842b8efac3852ccf2dc466623aa8eeaea245436ed889aa2ed22b8689997a7875": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          }
        ],
        "name": "FailedMarking",
        "type": "event"
      },
      "0xd9d0b091aebb6b491de28bb7faa8691ab87deafdb5753a532063f347052ff08e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "description",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "int256"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          }
        ],
        "name": "AddMarking",
        "type": "event"
      },
      "0xe6ce162265809f487ca530c8f318b648987fd7dfec923edcc424d43ff53ffbb7": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "total",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ProcessMarkings",
        "type": "event"
      },
      "0x593f3a6ca687633736d25531fb6f6fc7bd990ef6f1b7fb2c69cdf35a246e372e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "calculator",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "maxDuration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "fromBlock",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "toBlock",
            "type": "uint256"
          }
        ],
        "name": "AllMarkingsProcessed",
        "type": "event"
      },
      "0x5e763377c074567f93d6dbd49375bcea31d0ad895345b0ffa9aaed6f11106fbf": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "payout",
            "type": "uint256"
          }
        ],
        "name": "ModifyMarking",
        "type": "event"
      },
      "0xe85392445b5aa5368f61c68ea222f92bf5526e9f871142576e9a55dde7b56f0e": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "locked",
            "type": "bool"
          }
        ],
        "name": "SetPayrollLocked",
        "type": "event"
      }
    },
    "updated_at": 1494711507370,
    "links": {}
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.getNetwork(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "SpicePayroll";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.SpicePayroll = Contract;
  }
})();
