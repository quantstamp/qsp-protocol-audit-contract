const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');

const utils = require('./utils');

module.exports = function(deployer, network, accounts) {

  if (!utils.canDeploy(network, 'QuantstampAuditView')) {
    return;
  }
  
  deployer.deploy(QuantstampAuditView)
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAuditView', QuantstampAuditView.address));
};
