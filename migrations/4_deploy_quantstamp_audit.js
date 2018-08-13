const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');

const LinkedListLib = artifacts.require('LinkedListLib');
const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network, accounts) {

  if (!utils.canDeploy(network, 'QuantstampAudit')) {
    return;
  }
  
  deployer.deploy(LinkedListLib)
    .then(() => deployer.link(LinkedListLib, QuantstampAudit))
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.contractAddress(network, 'QuantstampAuditData', QuantstampAuditData))
    .then(dataContractAddress => deployer.deploy(QuantstampAudit, dataContractAddress))
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAudit', QuantstampAudit.address));
};
