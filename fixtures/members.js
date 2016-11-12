module.exports = function(callback) {
  const members = SpiceMembers.deployed();
  const accounts = web3.eth.accounts;
  Promise.resolve()
    .then(() => Promise.all([
      members.addMember(accounts[1]),
      members.addMember(accounts[2]),
      members.addMember(accounts[3])
    ]))
    .then(() => Promise.all([
      members.setMemberLevel(accounts[1], 1),
      members.setMemberLevel(accounts[2], 2),
      members.setMemberLevel(accounts[3], 3)
    ]))
    .then(() => callback())
    .catch(callback);
};
