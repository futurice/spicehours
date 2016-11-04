var NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

function getTransactionError(func) {
  return Promise.resolve().then(func)
    .then(function(txid) {
      var tx = web3.eth.getTransaction(txid);
      var txr = web3.eth.getTransactionReceipt(txid);
      if (txr.gasUsed === tx.gas) throw new Error("all gas used");
    })
    .catch(function(err) {
      return err;
    });
}

contract("SpiceMembers", function(accounts) {

  describe("owner", function() {

    it("should be set initially", function() {
      var contract = SpiceMembers.deployed();
      return contract.owner.call().then(function(owner) {
        assert.equal(owner, accounts[0], "owner should be the default account");
      });
    });
  });

  describe("memberLevel", function() {

    it("should return None for non-members", function() {
      var contract = SpiceMembers.deployed();
      return contract.memberLevel.call(accounts[1]).then(function(level) {
        assert.equal(level.valueOf(), 0, "non-members should have no level");
      });
    });
  });

  describe("memberId", function() {

    it("should return 1 for initial owner", function() {
      var contract = SpiceMembers.deployed();
      return contract.memberId.call(accounts[0]).then(function(level) {
        assert.equal(level.valueOf(), 1, "initial owner should have id 1");
      });
    });
  });

  describe("member", function() {

    it("should return null address for non-members", function() {
      var contract = SpiceMembers.deployed();
      return contract.memberAddress.call(accounts[1]).then(function(member) {
        assert.equal(member, NULL_ADDRESS, "member address should not be found");
      });
    });
  });

  describe("memberCount", function() {

    it("should be one initially", function() {
      var contract = SpiceMembers.deployed();
      return contract.memberCount.call().then(function(count) {
        assert.equal(count.valueOf(), 1, "member count should be one");
      });
    });
  });

  describe("transferOwnership", function() {

    it("should fail for non-owners", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.transferOwnership(accounts[1], {from: accounts[1]});
      }).then(function(err) {
        assert.isDefined(err, "only owner should be able to transfer");
      });
    });

    it("should succeed for owner", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.transferOwnership(accounts[1]);
      }).then(function(err) {
        assert.isUndefined(err, "owner should be able to transfer");
        return contract.owner.call();
      }).then(function(owner) {
        assert.equal(owner, accounts[1], "ownership not changed");
      });
    });

    it("should keep new owner's memberId", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.addMember(accounts[0], {from: accounts[1]});
      }).then(function(err) {
        assert.isUndefined(err, "new owner should be able to add members");
        return getTransactionError(function() {
          return contract.setMemberLevel(accounts[0], 2, {from: accounts[1]});
        });
      }).then(function(err) {
        assert.isUndefined(err, "owner should be able to set member level");
        return contract.memberLevel.call(accounts[1]);
      }).then(function(level) {
        assert.equal(level.valueOf(), 0, "ownership should not change level");
        return getTransactionError(function() {
          return contract.transferOwnership(accounts[0], {from: accounts[1]});
        });
      }).then(function(err) {
        assert.isUndefined(err, "new owner should be able to transfer");
        return contract.memberLevel.call(accounts[0]);
      }).then(function(level) {
        assert.equal(level, 2, "owner should keep old member level");
        return contract.memberCount.call();
      }).then(function(count) {
        assert.equal(count.valueOf(), 2, "member count should be two");
      });
    });
  });

  describe("addMember", function() {

    it("should allow adding the owner as member", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.removeMember(accounts[0]);
      }).then(function(err) {
        assert.isUndefined(err, "should allow removing owner account");
        return getTransactionError(function() {
          return contract.addMember(accounts[0]);
        });
      }).then(function(err) {
        assert.isUndefined(err, "should allow adding owner account");
      });
    });

    it("should set a new member correctly", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.addMember(accounts[1]);
      }).then(function(err) {
        assert.isUndefined(err, "should allow adding a new member by the owner");
        return contract.memberCount.call();
      }).then(function(count) {
        assert.equal(count.valueOf(), 2, "new member count should be 2");
        return contract.memberAddress.call(count);
      }).then(function(member) {
        assert.equal(member, accounts[1], "new member address should be saved");
        return contract.memberLevel.call(member);
      }).then(function(level) {
        assert.equal(level.valueOf(), 1, "new member should have the lowest level");
      });
    });

    it("should not allow adding an existing member as member", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.addMember(accounts[1]);
      }).then(function(err) {
        assert.isDefined(err, "should throw an error if adding existing member as member");
      })
    });

    it("should not allow adding members by normal members", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.addMember(accounts[2], {from: accounts[1]});
      }).then(function(err) {
        assert.isDefined(err, "should throw an error if normal member adding members");
      });
    });

    it("should allow adding members by managers", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.setMemberLevel(accounts[1], 2);
      }).then(function(err) {
        assert.isUndefined(err, "should allow setting member level");
        return getTransactionError(function() {
          return contract.addMember(accounts[2], {from: accounts[1]});
        });
      }).then(function(err) {
        assert.isUndefined(err, "should allow adding member by manager");
      });
    });

    it("should have created a new member id for a member that doesn't have one yet", function() {
      var contract = SpiceMembers.deployed();
      return contract.memberId.call(accounts[2]).then(function(id) {
        assert.equal(id.valueOf(), 3, "third account should have id 3");
        return contract.memberCount.call();
      }).then(function(count) {
        assert.equal(count.valueOf(), 3, "should have three members");
      });
    });

  });

  describe("removeMember", function() {

    it("should remove an existing member", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.removeMember(accounts[1]);
      }).then(function(err) {
        assert.isUndefined(err, "should allow removing an existing member");
        return contract.memberCount.call();
      }).then(function(count) {
        assert.equal(count.valueOf(), 3, "member count should be same after removal");
        return contract.memberAddress.call(2);
      }).then(function(member) {
        assert.equal(member, accounts[1], "member address should stay after removal");
        return contract.memberLevel.call(accounts[1]);
      }).then(function(level) {
        assert.equal(level.valueOf(), 0, "member level should be zero after removal");
      });
    });

    it("should fail to remove a non-existing member", function() {
      var contract = SpiceMembers.deployed();
      return getTransactionError(function() {
        return contract.removeMember(accounts[1]);
      }).then(function(err) {
        assert.isDefined(err, "should not allow removing a non-existing member");
      });
    });
  });
});
