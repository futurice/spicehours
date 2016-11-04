module.exports = function(deployer) {
  deployer.deploy(SpiceMembers).then(function() {
    return deployer.deploy(SpiceHours, SpiceMembers.address);
  });
};
