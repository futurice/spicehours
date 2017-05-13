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
      throw new Error("SpiceMembers error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("SpiceMembers error: contract binary not set. Can't deploy new instance.");
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

      throw new Error("SpiceMembers contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of SpiceMembers: " + unlinked_libraries);
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
      throw new Error("Invalid address passed to SpiceMembers.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: SpiceMembers not deployed or address not set.");
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
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "removeMember",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "memberCount",
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
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "memberLevel",
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
        "constant": true,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "memberId",
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
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          },
          {
            "name": "info",
            "type": "bytes32"
          }
        ],
        "name": "setMemberInfo",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          },
          {
            "name": "level",
            "type": "uint8"
          }
        ],
        "name": "setMemberLevel",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "memberInfo",
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
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "memberAddress",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "addMember",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "transferOwnership",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "owner",
            "type": "address"
          }
        ],
        "name": "TransferOwnership",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "AddMember",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "RemoveMember",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "level",
            "type": "uint8"
          }
        ],
        "name": "SetMemberLevel",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "info",
            "type": "bytes32"
          }
        ],
        "name": "SetMemberInfo",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x600180546c01000000000000000000000000338102819004600160a060020a03199283161780845560038490557fe90b7bceb6e7df5418fb78d8ee546e97c83a08bbccc01a0644d599ccd2a7c2e08054600160a060020a0390921680840293909304919093161790915560c0604090815260608390526000608081905260a081905291825260208290528120828155918201805460ff1916905560029091018190556106939081906100b090396000f36060604052361561008d5760e060020a60003504630b1ca49a811461009257806311aee380146100c95780631ed454a5146100d757806339106821146100e75780633a6ab5691461011057806350405fdf146101295780638da5cb5b1461014e578063a313c37114610165578063ac5ad18814610191578063ca6d56dc146101b7578063f2fde38b146101e7575b610002565b346100025761020d600435600061023d825b600160a060020a03811660009081526020819052604090206001015460ff165b919050565b346100025761020f60035481565b346100025761020f6004356100a4565b346100025761020f600435600160a060020a0381166000908152602081905260409020546100c4565b346100025761020d60043560243560006102d3836100a4565b346100025761020d6004356024358015806101445750600381115b1561039057610002565b3461000257610221600154600160a060020a031681565b346100025761020f600435600160a060020a0381166000908152602081905260409020600201546100c4565b3461000257610221600435600260205260009081526040902054600160a060020a031681565b346100025761020d60043560015433600160a060020a0390811691161480159061047c5750600261047a336100a4565b346100025761020d60043560015433600160a060020a0390811691161461059757610002565b005b60408051918252519081900360200190f35b60408051600160a060020a039092168252519081900360200190f35b141561024857610002565b60015433600160a060020a0390811691161480159061026e5750610278816100a4565b11155b1561028157610002565b61026b336100a4565b600160a060020a03808216600081815260208190526040808220600101805460ff191690555191923316917fb4f9529cf2105e0b4758a4764745afc6627875ddf1a09fa46f6e790caacff2b89190a350565b14156102de57610002565b60015433600160a060020a0390811691161480159061030f575081600160a060020a031633600160a060020a031614155b8015610322575061032c826100a4565b11155b1561033557610002565b61031f336100a4565b600160a060020a03808316600081815260208181526040918290206002018590558151858152915192933316927fbbf7802657744d5fc61eac863a0b33340f93fcd30c817a95481327718b077e1a9281900390910190a35050565b600061039b836100a4565b14156103a657610002565b60015433600160a060020a039081169116148015906103cd5750806103ca336100a4565b11155b156103d757610002565b60015433600160a060020a039081169116148015906103fd5750610407826100a4565b11155b1561041057610002565b6103fa336100a4565b600160a060020a0382811660008181526020818152604091829020600101805460ff191660f860020a878102041790558151858152915192933316927f3d20e3d7ad23e513cf9e60beca387ead0026a83dc692a8d81fb81288aa67469a9281900390910190a35050565b105b1561048657610002565b6000610491826100a4565b1461049b57610002565b600160a060020a03811660009081526020819052604090205415156105405760038054600190810180835560009081526002602081815260408084208054600160a060020a031916606060020a89810204179055805160608101825295548652858201848152868201858152600160a060020a0389168652928590529320945185559151928401805460ff191660f860020a9485029490940493909317909255519101555b600160a060020a038082166000818152602081905260408082206001908101805460ff191690911790555191923316917f7ef619bd6be65b04d1a09552b76aafa94f08d0b2f42d743ab897b2c02997d1199190a350565b600160a060020a038116600090815260208190526040902054151561063c5760038054600190810180835560009081526002602081815260408084208054600160a060020a031916606060020a89810204179055805160608101825295548652858201848152868201858152600160a060020a0389168652928590529320945185559151928401805460ff191660f860020a9485029490940493909317909255519101555b60018054600160a060020a031916606060020a838102041790819055604051600160a060020a03918216913316907f5c486528ec3e3f0ea91181cff8116f02bfa350e03b8b6f12e00765adbb5af85c90600090a35056",
    "events": {
      "0x5c486528ec3e3f0ea91181cff8116f02bfa350e03b8b6f12e00765adbb5af85c": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "owner",
            "type": "address"
          }
        ],
        "name": "TransferOwnership",
        "type": "event"
      },
      "0x7ef619bd6be65b04d1a09552b76aafa94f08d0b2f42d743ab897b2c02997d119": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "AddMember",
        "type": "event"
      },
      "0xb4f9529cf2105e0b4758a4764745afc6627875ddf1a09fa46f6e790caacff2b8": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "RemoveMember",
        "type": "event"
      },
      "0x3d20e3d7ad23e513cf9e60beca387ead0026a83dc692a8d81fb81288aa67469a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "level",
            "type": "uint8"
          }
        ],
        "name": "SetMemberLevel",
        "type": "event"
      },
      "0xbbf7802657744d5fc61eac863a0b33340f93fcd30c817a95481327718b077e1a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "info",
            "type": "bytes32"
          }
        ],
        "name": "SetMemberInfo",
        "type": "event"
      }
    },
    "updated_at": 1483121475258,
    "links": {},
    "address": "0x4ed985e2da341e276bbf7782f2e1e30689d33c89"
  },
  "3": {
    "abi": [
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "removeMember",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "memberCount",
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
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "memberLevel",
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
        "constant": true,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "memberId",
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
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          },
          {
            "name": "info",
            "type": "bytes32"
          }
        ],
        "name": "setMemberInfo",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          },
          {
            "name": "level",
            "type": "uint8"
          }
        ],
        "name": "setMemberLevel",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "memberInfo",
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
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "memberAddress",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "addMember",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "transferOwnership",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "owner",
            "type": "address"
          }
        ],
        "name": "TransferOwnership",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "AddMember",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "RemoveMember",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "level",
            "type": "uint8"
          }
        ],
        "name": "SetMemberLevel",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "info",
            "type": "bytes32"
          }
        ],
        "name": "SetMemberInfo",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x600180546c01000000000000000000000000338102819004600160a060020a03199283161780845560038490557fe90b7bceb6e7df5418fb78d8ee546e97c83a08bbccc01a0644d599ccd2a7c2e08054600160a060020a0390921680840293909304919093161790915560c0604090815260608390526000608081905260a081905291825260208290528120828155918201805460ff1916905560029091018190556106939081906100b090396000f36060604052361561008d5760e060020a60003504630b1ca49a811461009257806311aee380146100c95780631ed454a5146100d757806339106821146100e75780633a6ab5691461011057806350405fdf146101295780638da5cb5b1461014e578063a313c37114610165578063ac5ad18814610191578063ca6d56dc146101b7578063f2fde38b146101e7575b610002565b346100025761020d600435600061023d825b600160a060020a03811660009081526020819052604090206001015460ff165b919050565b346100025761020f60035481565b346100025761020f6004356100a4565b346100025761020f600435600160a060020a0381166000908152602081905260409020546100c4565b346100025761020d60043560243560006102d3836100a4565b346100025761020d6004356024358015806101445750600381115b1561039057610002565b3461000257610221600154600160a060020a031681565b346100025761020f600435600160a060020a0381166000908152602081905260409020600201546100c4565b3461000257610221600435600260205260009081526040902054600160a060020a031681565b346100025761020d60043560015433600160a060020a0390811691161480159061047c5750600261047a336100a4565b346100025761020d60043560015433600160a060020a0390811691161461059757610002565b005b60408051918252519081900360200190f35b60408051600160a060020a039092168252519081900360200190f35b141561024857610002565b60015433600160a060020a0390811691161480159061026e5750610278816100a4565b11155b1561028157610002565b61026b336100a4565b600160a060020a03808216600081815260208190526040808220600101805460ff191690555191923316917fb4f9529cf2105e0b4758a4764745afc6627875ddf1a09fa46f6e790caacff2b89190a350565b14156102de57610002565b60015433600160a060020a0390811691161480159061030f575081600160a060020a031633600160a060020a031614155b8015610322575061032c826100a4565b11155b1561033557610002565b61031f336100a4565b600160a060020a03808316600081815260208181526040918290206002018590558151858152915192933316927fbbf7802657744d5fc61eac863a0b33340f93fcd30c817a95481327718b077e1a9281900390910190a35050565b600061039b836100a4565b14156103a657610002565b60015433600160a060020a039081169116148015906103cd5750806103ca336100a4565b11155b156103d757610002565b60015433600160a060020a039081169116148015906103fd5750610407826100a4565b11155b1561041057610002565b6103fa336100a4565b600160a060020a0382811660008181526020818152604091829020600101805460ff191660f860020a878102041790558151858152915192933316927f3d20e3d7ad23e513cf9e60beca387ead0026a83dc692a8d81fb81288aa67469a9281900390910190a35050565b105b1561048657610002565b6000610491826100a4565b1461049b57610002565b600160a060020a03811660009081526020819052604090205415156105405760038054600190810180835560009081526002602081815260408084208054600160a060020a031916606060020a89810204179055805160608101825295548652858201848152868201858152600160a060020a0389168652928590529320945185559151928401805460ff191660f860020a9485029490940493909317909255519101555b600160a060020a038082166000818152602081905260408082206001908101805460ff191690911790555191923316917f7ef619bd6be65b04d1a09552b76aafa94f08d0b2f42d743ab897b2c02997d1199190a350565b600160a060020a038116600090815260208190526040902054151561063c5760038054600190810180835560009081526002602081815260408084208054600160a060020a031916606060020a89810204179055805160608101825295548652858201848152868201858152600160a060020a0389168652928590529320945185559151928401805460ff191660f860020a9485029490940493909317909255519101555b60018054600160a060020a031916606060020a838102041790819055604051600160a060020a03918216913316907f5c486528ec3e3f0ea91181cff8116f02bfa350e03b8b6f12e00765adbb5af85c90600090a35056",
    "events": {
      "0x5c486528ec3e3f0ea91181cff8116f02bfa350e03b8b6f12e00765adbb5af85c": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "owner",
            "type": "address"
          }
        ],
        "name": "TransferOwnership",
        "type": "event"
      },
      "0x7ef619bd6be65b04d1a09552b76aafa94f08d0b2f42d743ab897b2c02997d119": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "AddMember",
        "type": "event"
      },
      "0xb4f9529cf2105e0b4758a4764745afc6627875ddf1a09fa46f6e790caacff2b8": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "RemoveMember",
        "type": "event"
      },
      "0x3d20e3d7ad23e513cf9e60beca387ead0026a83dc692a8d81fb81288aa67469a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "level",
            "type": "uint8"
          }
        ],
        "name": "SetMemberLevel",
        "type": "event"
      },
      "0xbbf7802657744d5fc61eac863a0b33340f93fcd30c817a95481327718b077e1a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "info",
            "type": "bytes32"
          }
        ],
        "name": "SetMemberInfo",
        "type": "event"
      }
    },
    "updated_at": 1483125009158,
    "links": {},
    "address": "0x4ed985e2da341e276bbf7782f2e1e30689d33c89"
  },
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "removeMember",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "memberCount",
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
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "memberLevel",
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
        "constant": true,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "memberId",
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
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          },
          {
            "name": "info",
            "type": "bytes32"
          }
        ],
        "name": "setMemberInfo",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          },
          {
            "name": "level",
            "type": "uint8"
          }
        ],
        "name": "setMemberLevel",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "memberInfo",
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
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "memberAddress",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "addMember",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "_target",
            "type": "address"
          }
        ],
        "name": "transferOwnership",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "owner",
            "type": "address"
          }
        ],
        "name": "TransferOwnership",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "AddMember",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "RemoveMember",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "level",
            "type": "uint8"
          }
        ],
        "name": "SetMemberLevel",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "info",
            "type": "bytes32"
          }
        ],
        "name": "SetMemberInfo",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x600180546c01000000000000000000000000338102819004600160a060020a03199283161780845560038490557fe90b7bceb6e7df5418fb78d8ee546e97c83a08bbccc01a0644d599ccd2a7c2e08054600160a060020a0390921680840293909304919093161790915560c0604090815260608390526000608081905260a081905291825260208290528120828155918201805460ff1916905560029091018190556106939081906100b090396000f36060604052361561008d5760e060020a60003504630b1ca49a811461009257806311aee380146100c95780631ed454a5146100d757806339106821146100e75780633a6ab5691461011057806350405fdf146101295780638da5cb5b1461014e578063a313c37114610165578063ac5ad18814610191578063ca6d56dc146101b7578063f2fde38b146101e7575b610002565b346100025761020d600435600061023d825b600160a060020a03811660009081526020819052604090206001015460ff165b919050565b346100025761020f60035481565b346100025761020f6004356100a4565b346100025761020f600435600160a060020a0381166000908152602081905260409020546100c4565b346100025761020d60043560243560006102d3836100a4565b346100025761020d6004356024358015806101445750600381115b1561039057610002565b3461000257610221600154600160a060020a031681565b346100025761020f600435600160a060020a0381166000908152602081905260409020600201546100c4565b3461000257610221600435600260205260009081526040902054600160a060020a031681565b346100025761020d60043560015433600160a060020a0390811691161480159061047c5750600261047a336100a4565b346100025761020d60043560015433600160a060020a0390811691161461059757610002565b005b60408051918252519081900360200190f35b60408051600160a060020a039092168252519081900360200190f35b141561024857610002565b60015433600160a060020a0390811691161480159061026e5750610278816100a4565b11155b1561028157610002565b61026b336100a4565b600160a060020a03808216600081815260208190526040808220600101805460ff191690555191923316917fb4f9529cf2105e0b4758a4764745afc6627875ddf1a09fa46f6e790caacff2b89190a350565b14156102de57610002565b60015433600160a060020a0390811691161480159061030f575081600160a060020a031633600160a060020a031614155b8015610322575061032c826100a4565b11155b1561033557610002565b61031f336100a4565b600160a060020a03808316600081815260208181526040918290206002018590558151858152915192933316927fbbf7802657744d5fc61eac863a0b33340f93fcd30c817a95481327718b077e1a9281900390910190a35050565b600061039b836100a4565b14156103a657610002565b60015433600160a060020a039081169116148015906103cd5750806103ca336100a4565b11155b156103d757610002565b60015433600160a060020a039081169116148015906103fd5750610407826100a4565b11155b1561041057610002565b6103fa336100a4565b600160a060020a0382811660008181526020818152604091829020600101805460ff191660f860020a878102041790558151858152915192933316927f3d20e3d7ad23e513cf9e60beca387ead0026a83dc692a8d81fb81288aa67469a9281900390910190a35050565b105b1561048657610002565b6000610491826100a4565b1461049b57610002565b600160a060020a03811660009081526020819052604090205415156105405760038054600190810180835560009081526002602081815260408084208054600160a060020a031916606060020a89810204179055805160608101825295548652858201848152868201858152600160a060020a0389168652928590529320945185559151928401805460ff191660f860020a9485029490940493909317909255519101555b600160a060020a038082166000818152602081905260408082206001908101805460ff191690911790555191923316917f7ef619bd6be65b04d1a09552b76aafa94f08d0b2f42d743ab897b2c02997d1199190a350565b600160a060020a038116600090815260208190526040902054151561063c5760038054600190810180835560009081526002602081815260408084208054600160a060020a031916606060020a89810204179055805160608101825295548652858201848152868201858152600160a060020a0389168652928590529320945185559151928401805460ff191660f860020a9485029490940493909317909255519101555b60018054600160a060020a031916606060020a838102041790819055604051600160a060020a03918216913316907f5c486528ec3e3f0ea91181cff8116f02bfa350e03b8b6f12e00765adbb5af85c90600090a35056",
    "events": {
      "0x5c486528ec3e3f0ea91181cff8116f02bfa350e03b8b6f12e00765adbb5af85c": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "owner",
            "type": "address"
          }
        ],
        "name": "TransferOwnership",
        "type": "event"
      },
      "0x7ef619bd6be65b04d1a09552b76aafa94f08d0b2f42d743ab897b2c02997d119": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "AddMember",
        "type": "event"
      },
      "0xb4f9529cf2105e0b4758a4764745afc6627875ddf1a09fa46f6e790caacff2b8": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          }
        ],
        "name": "RemoveMember",
        "type": "event"
      },
      "0x3d20e3d7ad23e513cf9e60beca387ead0026a83dc692a8d81fb81288aa67469a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "level",
            "type": "uint8"
          }
        ],
        "name": "SetMemberLevel",
        "type": "event"
      },
      "0xbbf7802657744d5fc61eac863a0b33340f93fcd30c817a95481327718b077e1a": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "member",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "info",
            "type": "bytes32"
          }
        ],
        "name": "SetMemberInfo",
        "type": "event"
      }
    },
    "updated_at": 1494711507350,
    "links": {},
    "address": "0xed015278b8db6cf973a2e99869e51f56f3de1fe2"
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

  Contract.contract_name   = Contract.prototype.contract_name   = "SpiceMembers";
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
    window.SpiceMembers = Contract;
  }
})();
