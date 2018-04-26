const QuantstampToken = artifacts.require('test/QuantstampToken');

module.exports = function(deployer, network, accounts) {
  if (network === "development" || network === "minikube") {
    let admin = accounts[1];
    console.log("Admin: " + admin);
    deployer.deploy(QuantstampToken, admin);
  }
};
