const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampToken = artifacts.require('test/QuantstampToken');

const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network, accounts) {

  if (!utils.canDeploy(network, 'QuantstampAuditData')) {
    return;
  }

  const tokenContractAddress = utils.tokenAddress(network, QuantstampToken);
  console.log('Token contract address:', tokenContractAddress);

  deployer
    .then(() => deployer.deploy(QuantstampAuditData, tokenContractAddress))
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAuditData', QuantstampAuditData));
};
