const QuantstampToken = artifacts.require('test/QuantstampToken');

module.exports = function(deployer, network, accounts) {

  if (network === "development") {
    let admin = accounts[1];
    console.log("Admin: " + admin);
    deployer.deploy(QuantstampToken, admin);
  } else {
    console.log("Deploying QuantstampToken is skipped on " + network);
  }
};
