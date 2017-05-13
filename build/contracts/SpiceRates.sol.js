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
      throw new Error("SpiceRates error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("SpiceRates error: contract binary not set. Can't deploy new instance.");
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

      throw new Error("SpiceRates contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of SpiceRates: " + unlinked_libraries);
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
      throw new Error("Invalid address passed to SpiceRates.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: SpiceRates not deployed or address not set.");
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
        "constant": true,
        "inputs": [],
        "name": "hourlyRate",
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
        "name": "unpaidPercentage",
        "outputs": [
          {
            "name": "",
            "type": "uint8"
          }
        ],
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
            "name": "_percentage",
            "type": "uint8"
          }
        ],
        "name": "setUnpaidPercentage",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_hourlyRate",
            "type": "uint256"
          }
        ],
        "name": "setHourlyRate",
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
        "name": "calculatePayout",
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
        "inputs": [
          {
            "name": "_members",
            "type": "address"
          },
          {
            "name": "_hourlyRate",
            "type": "uint256"
          }
        ],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "hourlyRate",
            "type": "uint256"
          }
        ],
        "name": "SetHourlyRate",
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
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "SetUnpaidPercentage",
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
            "name": "hourlyRate",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "CalculatePayout",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x60606040818152806104dc833960a090819052905160805160008054600160a060020a0319166c0100000000000000000000000080850204179055600181905580835290917f3c02e3517a8b75fc4492d2a19832327f994d9e9622da4e3ffe192d2a62cfe2b790602090a150506104628061007a6000396000f3606060405236156100615760e060020a60003504630cbb0f838114610066578063394648841461008157806359a7b3fe146100b057806362afd64a146100be5780639233d561146100ce578063c17c3521146101f1578063e2b863cf1461028d575b610002565b34610002576003545b60408051918252519081900360200190f35b346100025761006f600435600060036000508281548110156100025760009182526020909120015490506102be565b346100025761006f60015481565b34610002576102c36004356102a6565b34610002576102d960043560243560006102db3360006002600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f11561000257505060405151919091101590508061045b575061045b825b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a0384811691161491506102be9050565b34610002576102d96004356103d83360006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f11561000257505060405151919091101590508061045b575061045b8261016b565b346100025761006f6004356024356000600060006103e8855b600081815260026020526040902054610100900460ff165b919050565b6040805160ff9092168252519081900360200190f35b005b15156102e657610002565b60648260ff1611156102f757610002565b82151561030357610002565b506000828152600260205260409020805460ff16151561037d57805460ff19166001908117825560038054918201808255909190828183801582901161036a5760008381526020902061036a9181019083015b808211156103d45760008155600101610356565b5050506000928352506020909120018390555b805460f860020a808402046101000261ff00199091161781556040805160ff84168152905184917fe2e8445c41b0f2ff6e5dc4c608ee67d50deec3ceb2f828d96638fd529bd0ab0b919081900360200190a2505050565b5090565b15156103e357610002565b600155565b60015460408051878152602081019290925260ff8316828201525191935086917f055cbb3d7719a91ecb82a72a021542c4ee72c545d0e630d65dcb3eeee92081e69181900360600190a2610e106001600050548502811561000257049050606460ff838203168202049250505092915050565b90506102be56",
    "events": {
      "0x3c02e3517a8b75fc4492d2a19832327f994d9e9622da4e3ffe192d2a62cfe2b7": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "hourlyRate",
            "type": "uint256"
          }
        ],
        "name": "SetHourlyRate",
        "type": "event"
      },
      "0xe2e8445c41b0f2ff6e5dc4c608ee67d50deec3ceb2f828d96638fd529bd0ab0b": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "SetUnpaidPercentage",
        "type": "event"
      },
      "0x055cbb3d7719a91ecb82a72a021542c4ee72c545d0e630d65dcb3eeee92081e6": {
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
            "name": "hourlyRate",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "CalculatePayout",
        "type": "event"
      }
    },
    "updated_at": 1483121475270,
    "links": {},
    "address": "0x15388e59ce6a854c29d7330a6cf4746312f20af7"
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
        "constant": true,
        "inputs": [],
        "name": "hourlyRate",
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
        "name": "unpaidPercentage",
        "outputs": [
          {
            "name": "",
            "type": "uint8"
          }
        ],
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
            "name": "_percentage",
            "type": "uint8"
          }
        ],
        "name": "setUnpaidPercentage",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_hourlyRate",
            "type": "uint256"
          }
        ],
        "name": "setHourlyRate",
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
        "name": "calculatePayout",
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
        "inputs": [
          {
            "name": "_members",
            "type": "address"
          },
          {
            "name": "_hourlyRate",
            "type": "uint256"
          }
        ],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "hourlyRate",
            "type": "uint256"
          }
        ],
        "name": "SetHourlyRate",
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
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "SetUnpaidPercentage",
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
            "name": "hourlyRate",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "CalculatePayout",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x60606040818152806104dc833960a090819052905160805160008054600160a060020a0319166c0100000000000000000000000080850204179055600181905580835290917f3c02e3517a8b75fc4492d2a19832327f994d9e9622da4e3ffe192d2a62cfe2b790602090a150506104628061007a6000396000f3606060405236156100615760e060020a60003504630cbb0f838114610066578063394648841461008157806359a7b3fe146100b057806362afd64a146100be5780639233d561146100ce578063c17c3521146101f1578063e2b863cf1461028d575b610002565b34610002576003545b60408051918252519081900360200190f35b346100025761006f600435600060036000508281548110156100025760009182526020909120015490506102be565b346100025761006f60015481565b34610002576102c36004356102a6565b34610002576102d960043560243560006102db3360006002600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f11561000257505060405151919091101590508061045b575061045b825b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a0384811691161491506102be9050565b34610002576102d96004356103d83360006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f11561000257505060405151919091101590508061045b575061045b8261016b565b346100025761006f6004356024356000600060006103e8855b600081815260026020526040902054610100900460ff165b919050565b6040805160ff9092168252519081900360200190f35b005b15156102e657610002565b60648260ff1611156102f757610002565b82151561030357610002565b506000828152600260205260409020805460ff16151561037d57805460ff19166001908117825560038054918201808255909190828183801582901161036a5760008381526020902061036a9181019083015b808211156103d45760008155600101610356565b5050506000928352506020909120018390555b805460f860020a808402046101000261ff00199091161781556040805160ff84168152905184917fe2e8445c41b0f2ff6e5dc4c608ee67d50deec3ceb2f828d96638fd529bd0ab0b919081900360200190a2505050565b5090565b15156103e357610002565b600155565b60015460408051878152602081019290925260ff8316828201525191935086917f055cbb3d7719a91ecb82a72a021542c4ee72c545d0e630d65dcb3eeee92081e69181900360600190a2610e106001600050548502811561000257049050606460ff838203168202049250505092915050565b90506102be56",
    "events": {
      "0x3c02e3517a8b75fc4492d2a19832327f994d9e9622da4e3ffe192d2a62cfe2b7": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "hourlyRate",
            "type": "uint256"
          }
        ],
        "name": "SetHourlyRate",
        "type": "event"
      },
      "0xe2e8445c41b0f2ff6e5dc4c608ee67d50deec3ceb2f828d96638fd529bd0ab0b": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "SetUnpaidPercentage",
        "type": "event"
      },
      "0x055cbb3d7719a91ecb82a72a021542c4ee72c545d0e630d65dcb3eeee92081e6": {
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
            "name": "hourlyRate",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "CalculatePayout",
        "type": "event"
      }
    },
    "updated_at": 1483125009179,
    "links": {},
    "address": "0x15388e59ce6a854c29d7330a6cf4746312f20af7"
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
        "constant": true,
        "inputs": [],
        "name": "hourlyRate",
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
        "name": "unpaidPercentage",
        "outputs": [
          {
            "name": "",
            "type": "uint8"
          }
        ],
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
            "name": "_percentage",
            "type": "uint8"
          }
        ],
        "name": "setUnpaidPercentage",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_hourlyRate",
            "type": "uint256"
          }
        ],
        "name": "setHourlyRate",
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
        "name": "calculatePayout",
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
        "inputs": [
          {
            "name": "_members",
            "type": "address"
          },
          {
            "name": "_hourlyRate",
            "type": "uint256"
          }
        ],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "hourlyRate",
            "type": "uint256"
          }
        ],
        "name": "SetHourlyRate",
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
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "SetUnpaidPercentage",
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
            "name": "hourlyRate",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "CalculatePayout",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x60606040818152806104dc833960a090819052905160805160008054600160a060020a0319166c0100000000000000000000000080850204179055600181905580835290917f3c02e3517a8b75fc4492d2a19832327f994d9e9622da4e3ffe192d2a62cfe2b790602090a150506104628061007a6000396000f3606060405236156100615760e060020a60003504630cbb0f838114610066578063394648841461008157806359a7b3fe146100b057806362afd64a146100be5780639233d561146100ce578063c17c3521146101f1578063e2b863cf1461028d575b610002565b34610002576003545b60408051918252519081900360200190f35b346100025761006f600435600060036000508281548110156100025760009182526020909120015490506102be565b346100025761006f60015481565b34610002576102c36004356102a6565b34610002576102d960043560243560006102db3360006002600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f11561000257505060405151919091101590508061045b575061045b825b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a0384811691161491506102be9050565b34610002576102d96004356103d83360006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f11561000257505060405151919091101590508061045b575061045b8261016b565b346100025761006f6004356024356000600060006103e8855b600081815260026020526040902054610100900460ff165b919050565b6040805160ff9092168252519081900360200190f35b005b15156102e657610002565b60648260ff1611156102f757610002565b82151561030357610002565b506000828152600260205260409020805460ff16151561037d57805460ff19166001908117825560038054918201808255909190828183801582901161036a5760008381526020902061036a9181019083015b808211156103d45760008155600101610356565b5050506000928352506020909120018390555b805460f860020a808402046101000261ff00199091161781556040805160ff84168152905184917fe2e8445c41b0f2ff6e5dc4c608ee67d50deec3ceb2f828d96638fd529bd0ab0b919081900360200190a2505050565b5090565b15156103e357610002565b600155565b60015460408051878152602081019290925260ff8316828201525191935086917f055cbb3d7719a91ecb82a72a021542c4ee72c545d0e630d65dcb3eeee92081e69181900360600190a2610e106001600050548502811561000257049050606460ff838203168202049250505092915050565b90506102be56",
    "events": {
      "0x3c02e3517a8b75fc4492d2a19832327f994d9e9622da4e3ffe192d2a62cfe2b7": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "hourlyRate",
            "type": "uint256"
          }
        ],
        "name": "SetHourlyRate",
        "type": "event"
      },
      "0xe2e8445c41b0f2ff6e5dc4c608ee67d50deec3ceb2f828d96638fd529bd0ab0b": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "SetUnpaidPercentage",
        "type": "event"
      },
      "0x055cbb3d7719a91ecb82a72a021542c4ee72c545d0e630d65dcb3eeee92081e6": {
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
            "name": "hourlyRate",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "unpaidPercentage",
            "type": "uint8"
          }
        ],
        "name": "CalculatePayout",
        "type": "event"
      }
    },
    "updated_at": 1494707761133,
    "links": {},
    "address": "0xb7c10e5bc2472b3f34bea07da7efa1affa357dd6"
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

  Contract.contract_name   = Contract.prototype.contract_name   = "SpiceRates";
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
    window.SpiceRates = Contract;
  }
})();
