const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');
const LinkedListLib = artifacts.require('LinkedListLib');

const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network) {

  if (!utils.canDeploy(network, 'QuantstampAuditPolice')) {
    return;
  }

  deployer.deploy(LinkedListLib)
    .then(() => deployer.link(LinkedListLib, QuantstampAuditPolice))
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(() => deployer.deploy(QuantstampAuditPolice))
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAuditPolice', QuantstampAuditPolice.address));
};
