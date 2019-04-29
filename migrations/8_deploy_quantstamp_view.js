const QuantstampAuditView = artifacts.require('QuantstampAuditView');

const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network) {

  if (!utils.canDeploy(network, 'QuantstampAuditView')) {
    return;
  }
  
  deployer.deploy(QuantstampAuditView)
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAuditView', QuantstampAuditView));
};
