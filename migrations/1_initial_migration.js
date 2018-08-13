var Migrations = artifacts.require("./Migrations.sol");
const networkConfig = require('../truffle.js');

module.exports = function(deployer) {
  deployer.deploy(Migrations)
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)));
};
