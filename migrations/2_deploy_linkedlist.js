const LinkedListLib = artifacts.require('LinkedListLib');

const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network) {

  if (!utils.canDeploy(network, 'LinkedListLib')) {
    return;
  }

  deployer.deploy(LinkedListLib)
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'LinkedListLib', LinkedListLib.address));
};