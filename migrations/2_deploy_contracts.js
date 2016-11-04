module.exports = function(deployer) {
  deployer.deploy(SpiceMembers)
    .then(function() {
      return deployer.deploy(SpiceHours, SpiceMembers.address);
    })
    .then(function() {
      return deployer.deploy(SpiceRates, SpiceMembers.address);
    });
};
