const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');
const QuantstampToken = artifacts.require('test/QuantstampToken');

const LinkedListLib = artifacts.require('LinkedListLib');
const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network) {

  if (!utils.canDeploy(network, 'QuantstampAuditTokenEscrow')) {
    return;
  }

  const tokenContractAddress = utils.tokenAddress(network, QuantstampToken);
  console.log('Token contract address:', tokenContractAddress);

  deployer.deploy(QuantstampAuditTokenEscrow, tokenContractAddress)
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAuditTokenEscrow', QuantstampAuditTokenEscrow.address));
};
