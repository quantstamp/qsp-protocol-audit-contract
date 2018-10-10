const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');

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
    .then(async(dataContractAddress) => {return {dataContractAddress: dataContractAddress, multiRequestDataContractAddress: await utils.contractAddress(network, 'QuantstampAuditMultiRequestData', QuantstampAuditMultiRequestData)}})
    .then(dataContractsAddresses => deployer.deploy(QuantstampAudit, dataContractsAddresses.dataContractAddress, dataContractsAddresses.multiRequestDataContractAddress))
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAudit', QuantstampAudit.address));
};
