const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');

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
    .then(
      async() => {
        return {
          dataContractAddress: await utils.contractAddress(network, 'QuantstampAuditData', QuantstampAuditData),
          multiRequestDataContractAddress: await utils.contractAddress(network, 'QuantstampAuditMultiRequestData',QuantstampAuditMultiRequestData),
          reportDataContractAddress: await utils.contractAddress(network, 'QuantstampAuditReportData', QuantstampAuditReportData),
          tokenEscrowContractAddress: await utils.contractAddress(network, 'QuantstampAuditTokenEscrow', QuantstampAuditTokenEscrow)
        }
      })
    .then(dataContractsAddresses => deployer.deploy(
      QuantstampAudit,
      dataContractsAddresses.dataContractAddress,
      dataContractsAddresses.multiRequestDataContractAddress,
      dataContractsAddresses.reportDataContractAddress,
      dataContractsAddresses.tokenEscrowContractAddress))
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAudit', QuantstampAudit.address));
};
