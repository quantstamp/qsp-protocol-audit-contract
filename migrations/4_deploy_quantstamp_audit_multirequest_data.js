const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');

const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network, accounts) {

  if (!utils.canDeploy(network, 'QuantstampAuditMultiRequestData')) {
    return;
  }

  deployer.deploy(QuantstampAuditMultiRequestData)
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAuditMultiRequestData', QuantstampAuditMultiRequestData.address));
};
