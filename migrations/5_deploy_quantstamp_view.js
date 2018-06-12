const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');

const networkConfig = require('../truffle.js');
const utils = require('./utils');

module.exports = function(deployer, network, accounts) {

  if (!utils.canDeploy(network, 'QuantstampAuditView')) {
    return;
  }
  
  deployer
    .then(async() => await utils.contractAddress(network, 'QuantstampAudit', QuantstampAudit))
    .then(auditContractAddress => deployer.deploy(QuantstampAuditView, auditContractAddress))
    .then(async() => utils.updateAbiAndMetadata(network, 'QuantstampAuditView', QuantstampAuditView.address));
};
