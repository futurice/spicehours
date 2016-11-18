module.exports = function(deployer) {
  deployer.deploy(SpiceMembers)
    .then(function() {
      return deployer.deploy(SpiceHours, SpiceMembers.address);
    })
    .then(function() {
      // Deploy with default 15e * 1000000 hourly rate
      return deployer.deploy(SpiceRates, SpiceMembers.address, 15000000);
    });
};
