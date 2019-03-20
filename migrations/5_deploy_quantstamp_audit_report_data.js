const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');

const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network) {

  if (!utils.canDeploy(network, 'QuantstampAuditReportData')) {
    return;
  }

  deployer.deploy(QuantstampAuditReportData)
    .then(() => new Promise(resolve => setTimeout(() => resolve(), networkConfig.networks[network].delayBetweenDeploys)))
    .then(async() => await utils.updateAbiAndMetadata(network, 'QuantstampAuditReportData', QuantstampAuditReportData.address));
};
