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
      throw new Error("SpiceHours error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("SpiceHours error: contract binary not set. Can't deploy new instance.");
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

      throw new Error("SpiceHours contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of SpiceHours: " + unlinked_libraries);
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
      throw new Error("Invalid address passed to SpiceHours.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: SpiceHours not deployed or address not set.");
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
  "2": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "payrollCount",
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
        "name": "markHours",
        "outputs": [],
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
        "name": "infos",
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
        "name": "payrolls",
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
            "name": "",
            "type": "bytes32"
          }
        ],
        "name": "balances",
        "outputs": [
          {
            "name": "available",
            "type": "bool"
          },
          {
            "name": "duration",
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
        "name": "balance",
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
            "name": "_balanceConverter",
            "type": "address"
          }
        ],
        "name": "processPayroll",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "fromTimestamp",
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
        "name": "infoCount",
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
          }
        ],
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
          }
        ],
        "name": "MarkHours",
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
          }
        ],
        "name": "FixHours",
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
            "name": "payroll",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          }
        ],
        "name": "ProcessHours",
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
            "name": "payroll",
            "type": "address"
          }
        ],
        "name": "ProcessPayroll",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260405160208061110683395060806040525180600080546c0100000000000000000000000080840204600160a060020a03199091161790555042600155506110b6806100506000396000f3606060405236156100775760e060020a60003504630a883790811461007c578063114d081d1461008b57806328de3c9b146101af5780635632b1fa146101d85780638909aa3f1461020a57806389eba4211461023357806396d6591114610256578063df424814146102f6578063ff296eaa14610304575b610002565b34610002576103146002545b90565b346100025761032660043560243560443561035f3360006001600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f1156100025750506040515191909110159050806108e957506108e9825b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a0384811691161491506102519050565b346100025761031460043560048054829081101561000257600091825260209091200154905081565b346100025761032860043560028054829081101561000257600091825260209091200154600160a060020a0316905081565b3461000257600360205260043560009081526040902080546001909101546103449160ff169082565b34610002576103146004356000818152600360205260409020600101545b919050565b3461000257610326600435600060006106253360006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f1156100025750506040515191909110159050806108e957506108e982610129565b346100025761031460015481565b3461000257610314600454610088565b60408051918252519081900360200190f35b005b60408051600160a060020a039092168252519081900360200190f35b60408051921515835260208301919091528051918290030190f35b151561036a57610002565b6103fb3360006002600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f1156100025750506040515191909110159050806108e957506108e982610129565b15801561048557506000805460408051602090810184905281517fa313c371000000000000000000000000000000000000000000000000000000008152600160a060020a03338116600483015292518895939094169363a313c37193602480840194938390030190829087803b156100025760325a03f11561000257505060405151919091141590505b1561048f57610002565b6000811280156104b357506000838152600360205260408120600101549082900390105b156104bd57610002565b8015156104c957610002565b8215156104d557610002565b60008381526003602052604090205460ff16151561054c576000838152600360205260409020805460ff19166001908117909155600480549182018082559091908281838015829011610539576000838152602090206105399181019083016105ad565b5050506000928352506020909120018390555b60008112156105c557600083815260036020526040812060010180549183900390910390556105dd565b60048054600080835591909152610834907f8a35acfbc15ff81a39ae7d344fd709f28e8600b4aa8c65c6b64bfe7fe36bd19b908101905b808211156105c157600081556001016105ad565b5090565b60008381526003602052604090206001018054820190555b60408051828152905183918591600160a060020a033316917f6f4efb58b4f8fd5ff1346e7805519c37ccd822bf2c6d4f6b3b99d932ef882c14919081900360200190a4505050565b151561063057610002565b600054600154604051600160a060020a0390921691339186916107c6806108f08339018085600160a060020a0316815260200184600160a060020a0316815260200183600160a060020a03168152602001828152602001945050505050604051809103906000f08015610002579150600090505b6004548110156105765781600160a060020a031663d6d3d76a60046000508381548110156100025790600052602060002090016000505460048054600391600091879081101561000257600091825260208083209091015483528201929092526040908101822060010154815160e060020a86028152600481019490945260248401525160448084019382900301818387803b156100025760325a03f115610002575050506004600050818154811015610002579060005260206000209001600050546000191682600160a060020a031633600160a060020a03167f206acf360a33ed765dee4a3746d43d5977c4e49a1f3a77930ab6d64094e1f501600360005060006004600050878154811015610002579060005260206000209001600050548152602080820192909252604090810160002060010154815190815290519081900390910190a460048054600391600091849081101561000257906000526020600020900160005054815260208101919091526040016000908120805460ff19168155600101556001016106a4565b50604051600160a060020a038084169133909116907f2652249eb96588ddcf2b0341e7baf3b2522444d050d9faa700aadab079fe18e290600090a36002805460018101808355828183801582901161089d5760008381526020902061089d9181019083016105ad565b505050600092835250602090912001805473ffffffffffffffffffffffffffffffffffffffff19166c010000000000000000000000009384029390930492909217909155505042600155565b90506102515660606040526040516080806107c6833960e060408181529251915160a05160c05160008054600160a060020a03199081166c01000000000000000000000000808902819004919091179092556001805482163384028490041790556002805482168387028490041790819055600380549092168386029390930492909217908190556004839055426005819055838752610100529596939592949193600160a060020a0393841693909116917f0469cd0a6e4ef30656ef148cb0392b9b1412d9cc5c780ed0fa40416ade3f69f69190a3505050506106e5806100e16000396000f3606060405236156100985760e060020a6000350463042f4d54811461009d5780630c011388146100d65780633bd05562146100e4578063a64cf7f71461011c578063a69df4b5146101c0578063c80916d414610253578063ce3e39c01461026a578063d6d3d76a14610281578063df424814146102af578063e6bf5f7a146102bd578063f83d08ba146102f2578063fd3615c914610303575b610002565b346100025761030c600435600060066000508281548110156100025790600052602060002090600302016000506002015490505b919050565b346100025761030c60055481565b346100025761030c600435600060066000508281548110156100025790600052602060002090600302016000506001015490506100d1565b346100025761031e6004356024356000600061033c335b60006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f1156100025750506040515191909110159050806106de57506106de826101cd565b346100025761031e610489335b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a0384811691161491506100d19050565b3461000257610320600254600160a060020a031681565b3461000257610320600354600160a060020a031681565b346100025761031e600435602435600154600090819033600160a060020a039081169116146104b457610002565b346100025761030c60045481565b346100025761030c600435600060066000508281548110156100025790600052602060002090600302016000505490506100d1565b346100025761031e6106ad33610133565b34610002576006545b60408051918252519081900360200190f35b005b60408051600160a060020a039092168252519081900360200190f35b151561034757610002565b60005460a060020a900460ff161561035e57610002565b600680548590811015610002579060005260206000209060030201600050546003546040805160006020918201819052825160e060020a63e2b863cf02815260048101869052602481018990529251949650600160a060020a039093169363e2b863cf936044808501948390030190829087803b156100025760325a03f1156100025750506040805180516060820183528582526020820187905291810182905260068054929450909250908690811015610002576000918252602091829020835160039092020190815582820151600182015560409283015160029091015581518581529081018390528151849233600160a060020a0316927ff81f79243d2fbdb26e8692f3b6f04bce034bd9bef7240b07767315f38015db95929081900390910190a350505050565b151561049457610002565b6000805474ff000000000000000000000000000000000000000019169055565b60005460a060020a900460ff16156104cb57610002565b600354604080516000602091820181905282517f5dada54f00000000000000000000000000000000000000000000000000000000815260048101899052602481018890529251600160a060020a0390941693635dada54f9360448082019493918390030190829087803b156100025760325a03f11561000257505060408051805160035460006020938401819052845160e060020a63e2b863cf028152600481018b9052602481018490529451929750600160a060020a03909116945063e2b863cf936044808201949392918390030190829087803b156100025760325a03f1156100025750506040805180516060820183528782526020820186905291810182905260068054600181018083559395509193509182908280158290116106285760030281600302836000526020600020918201910161062891905b808211156106a9576000808255600182018190556002820155600301610607565b50505081548110156100025790600052602060002090600302016000508151815560208083015160018301556040928301516002909201919091558151858152908101849052808201839052905185917f1d31ce72899acd50b693608fbeffecac0b32b54fecad4d3e44cab63854fa52aa919081900360600190a250505050565b5090565b15156106b857610002565b6000805474ff0000000000000000000000000000000000000000191660a060020a179055565b90506100d156",
    "events": {
      "0x6f4efb58b4f8fd5ff1346e7805519c37ccd822bf2c6d4f6b3b99d932ef882c14": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
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
          }
        ],
        "name": "MarkHours",
        "type": "event"
      },
      "0xbdf76d711abaa1d89a2a279e8806e31abf84e750885adc7c2180355450ee69c6": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
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
          }
        ],
        "name": "FixHours",
        "type": "event"
      },
      "0x206acf360a33ed765dee4a3746d43d5977c4e49a1f3a77930ab6d64094e1f501": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "payroll",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          }
        ],
        "name": "ProcessHours",
        "type": "event"
      },
      "0x2652249eb96588ddcf2b0341e7baf3b2522444d050d9faa700aadab079fe18e2": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "payroll",
            "type": "address"
          }
        ],
        "name": "ProcessPayroll",
        "type": "event"
      }
    },
    "updated_at": 1479070784490,
    "links": {},
    "address": "0x927453cf497ded5c915c2385d9d500424a370db3"
  },
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "payrollCount",
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
        "name": "markHours",
        "outputs": [],
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
        "name": "infos",
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
        "name": "payrolls",
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
            "name": "",
            "type": "bytes32"
          }
        ],
        "name": "balances",
        "outputs": [
          {
            "name": "available",
            "type": "bool"
          },
          {
            "name": "duration",
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
        "name": "balance",
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
            "name": "_balanceConverter",
            "type": "address"
          }
        ],
        "name": "processPayroll",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "fromTimestamp",
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
        "name": "infoCount",
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
          }
        ],
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
          }
        ],
        "name": "MarkHours",
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
          }
        ],
        "name": "FixHours",
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
            "name": "payroll",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          }
        ],
        "name": "ProcessHours",
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
            "name": "payroll",
            "type": "address"
          }
        ],
        "name": "ProcessPayroll",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405260405160208061110683395060806040525180600080546c0100000000000000000000000080840204600160a060020a03199091161790555042600155506110b6806100506000396000f3606060405236156100775760e060020a60003504630a883790811461007c578063114d081d1461008b57806328de3c9b146101af5780635632b1fa146101d85780638909aa3f1461020a57806389eba4211461023357806396d6591114610256578063df424814146102f6578063ff296eaa14610304575b610002565b34610002576103146002545b90565b346100025761032660043560243560443561035f3360006001600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f1156100025750506040515191909110159050806108e957506108e9825b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a0384811691161491506102519050565b346100025761031460043560048054829081101561000257600091825260209091200154905081565b346100025761032860043560028054829081101561000257600091825260209091200154600160a060020a0316905081565b3461000257600360205260043560009081526040902080546001909101546103449160ff169082565b34610002576103146004356000818152600360205260409020600101545b919050565b3461000257610326600435600060006106253360006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f1156100025750506040515191909110159050806108e957506108e982610129565b346100025761031460015481565b3461000257610314600454610088565b60408051918252519081900360200190f35b005b60408051600160a060020a039092168252519081900360200190f35b60408051921515835260208301919091528051918290030190f35b151561036a57610002565b6103fb3360006002600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f1156100025750506040515191909110159050806108e957506108e982610129565b15801561048557506000805460408051602090810184905281517fa313c371000000000000000000000000000000000000000000000000000000008152600160a060020a03338116600483015292518895939094169363a313c37193602480840194938390030190829087803b156100025760325a03f11561000257505060405151919091141590505b1561048f57610002565b6000811280156104b357506000838152600360205260408120600101549082900390105b156104bd57610002565b8015156104c957610002565b8215156104d557610002565b60008381526003602052604090205460ff16151561054c576000838152600360205260409020805460ff19166001908117909155600480549182018082559091908281838015829011610539576000838152602090206105399181019083016105ad565b5050506000928352506020909120018390555b60008112156105c557600083815260036020526040812060010180549183900390910390556105dd565b60048054600080835591909152610834907f8a35acfbc15ff81a39ae7d344fd709f28e8600b4aa8c65c6b64bfe7fe36bd19b908101905b808211156105c157600081556001016105ad565b5090565b60008381526003602052604090206001018054820190555b60408051828152905183918591600160a060020a033316917f6f4efb58b4f8fd5ff1346e7805519c37ccd822bf2c6d4f6b3b99d932ef882c14919081900360200190a4505050565b151561063057610002565b600054600154604051600160a060020a0390921691339186916107c6806108f08339018085600160a060020a0316815260200184600160a060020a0316815260200183600160a060020a03168152602001828152602001945050505050604051809103906000f08015610002579150600090505b6004548110156105765781600160a060020a031663d6d3d76a60046000508381548110156100025790600052602060002090016000505460048054600391600091879081101561000257600091825260208083209091015483528201929092526040908101822060010154815160e060020a86028152600481019490945260248401525160448084019382900301818387803b156100025760325a03f115610002575050506004600050818154811015610002579060005260206000209001600050546000191682600160a060020a031633600160a060020a03167f206acf360a33ed765dee4a3746d43d5977c4e49a1f3a77930ab6d64094e1f501600360005060006004600050878154811015610002579060005260206000209001600050548152602080820192909252604090810160002060010154815190815290519081900390910190a460048054600391600091849081101561000257906000526020600020900160005054815260208101919091526040016000908120805460ff19168155600101556001016106a4565b50604051600160a060020a038084169133909116907f2652249eb96588ddcf2b0341e7baf3b2522444d050d9faa700aadab079fe18e290600090a36002805460018101808355828183801582901161089d5760008381526020902061089d9181019083016105ad565b505050600092835250602090912001805473ffffffffffffffffffffffffffffffffffffffff19166c010000000000000000000000009384029390930492909217909155505042600155565b90506102515660606040526040516080806107c6833960e060408181529251915160a05160c05160008054600160a060020a03199081166c01000000000000000000000000808902819004919091179092556001805482163384028490041790556002805482168387028490041790819055600380549092168386029390930492909217908190556004839055426005819055838752610100529596939592949193600160a060020a0393841693909116917f0469cd0a6e4ef30656ef148cb0392b9b1412d9cc5c780ed0fa40416ade3f69f69190a3505050506106e5806100e16000396000f3606060405236156100985760e060020a6000350463042f4d54811461009d5780630c011388146100d65780633bd05562146100e4578063a64cf7f71461011c578063a69df4b5146101c0578063c80916d414610253578063ce3e39c01461026a578063d6d3d76a14610281578063df424814146102af578063e6bf5f7a146102bd578063f83d08ba146102f2578063fd3615c914610303575b610002565b346100025761030c600435600060066000508281548110156100025790600052602060002090600302016000506002015490505b919050565b346100025761030c60055481565b346100025761030c600435600060066000508281548110156100025790600052602060002090600302016000506001015490506100d1565b346100025761031e6004356024356000600061033c335b60006003600060009054906101000a9004600160a060020a0316600160a060020a0316631ed454a5846000604051602001526040518260e060020a0281526004018082600160a060020a03168152602001915050602060405180830381600087803b156100025760325a03f1156100025750506040515191909110159050806106de57506106de826101cd565b346100025761031e610489335b6000805460408051602090810184905281517f8da5cb5b0000000000000000000000000000000000000000000000000000000081529151600160a060020a0390931692638da5cb5b92600480820193929182900301818787803b156100025760325a03f11561000257505060405151600160a060020a0384811691161491506100d19050565b3461000257610320600254600160a060020a031681565b3461000257610320600354600160a060020a031681565b346100025761031e600435602435600154600090819033600160a060020a039081169116146104b457610002565b346100025761030c60045481565b346100025761030c600435600060066000508281548110156100025790600052602060002090600302016000505490506100d1565b346100025761031e6106ad33610133565b34610002576006545b60408051918252519081900360200190f35b005b60408051600160a060020a039092168252519081900360200190f35b151561034757610002565b60005460a060020a900460ff161561035e57610002565b600680548590811015610002579060005260206000209060030201600050546003546040805160006020918201819052825160e060020a63e2b863cf02815260048101869052602481018990529251949650600160a060020a039093169363e2b863cf936044808501948390030190829087803b156100025760325a03f1156100025750506040805180516060820183528582526020820187905291810182905260068054929450909250908690811015610002576000918252602091829020835160039092020190815582820151600182015560409283015160029091015581518581529081018390528151849233600160a060020a0316927ff81f79243d2fbdb26e8692f3b6f04bce034bd9bef7240b07767315f38015db95929081900390910190a350505050565b151561049457610002565b6000805474ff000000000000000000000000000000000000000019169055565b60005460a060020a900460ff16156104cb57610002565b600354604080516000602091820181905282517f5dada54f00000000000000000000000000000000000000000000000000000000815260048101899052602481018890529251600160a060020a0390941693635dada54f9360448082019493918390030190829087803b156100025760325a03f11561000257505060408051805160035460006020938401819052845160e060020a63e2b863cf028152600481018b9052602481018490529451929750600160a060020a03909116945063e2b863cf936044808201949392918390030190829087803b156100025760325a03f1156100025750506040805180516060820183528782526020820186905291810182905260068054600181018083559395509193509182908280158290116106285760030281600302836000526020600020918201910161062891905b808211156106a9576000808255600182018190556002820155600301610607565b50505081548110156100025790600052602060002090600302016000508151815560208083015160018301556040928301516002909201919091558151858152908101849052808201839052905185917f1d31ce72899acd50b693608fbeffecac0b32b54fecad4d3e44cab63854fa52aa919081900360600190a250505050565b5090565b15156106b857610002565b6000805474ff0000000000000000000000000000000000000000191660a060020a179055565b90506100d156",
    "events": {
      "0x6f4efb58b4f8fd5ff1346e7805519c37ccd822bf2c6d4f6b3b99d932ef882c14": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
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
          }
        ],
        "name": "MarkHours",
        "type": "event"
      },
      "0xbdf76d711abaa1d89a2a279e8806e31abf84e750885adc7c2180355450ee69c6": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
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
          }
        ],
        "name": "FixHours",
        "type": "event"
      },
      "0x206acf360a33ed765dee4a3746d43d5977c4e49a1f3a77930ab6d64094e1f501": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "payroll",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "info",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "duration",
            "type": "uint256"
          }
        ],
        "name": "ProcessHours",
        "type": "event"
      },
      "0x2652249eb96588ddcf2b0341e7baf3b2522444d050d9faa700aadab079fe18e2": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "sender",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "payroll",
            "type": "address"
          }
        ],
        "name": "ProcessPayroll",
        "type": "event"
      }
    },
    "updated_at": 1479069957006
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

  Contract.contract_name   = Contract.prototype.contract_name   = "SpiceHours";
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
    window.SpiceHours = Contract;
  }
})();
