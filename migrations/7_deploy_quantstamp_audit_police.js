const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');
const LinkedListLib = artifacts.require('LinkedListLib');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');

const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network) {

  if (!utils.canDeploy(network, 'QuantstampAuditPolice')) {
    return;
  }

  deployer.link(LinkedListLib, QuantstampAuditPolice)
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(
      async() => {
        return {
          dataContractAddress: await utils.contractAddress(network, 'QuantstampAuditData', QuantstampAuditData),
          tokenEscrowContractAddress: await utils.contractAddress(network, 'QuantstampAuditTokenEscrow', QuantstampAuditTokenEscrow)
        }
      })
    .then(dataContractsAddresses => deployer.deploy(
      QuantstampAuditPolice,
      dataContractsAddresses.dataContractAddress,
      dataContractsAddresses.tokenEscrowContractAddress))
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAuditPolice', QuantstampAuditPolice));
};
