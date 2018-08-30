'use strict';

const utils = require('../migrations/utils.js');
const BN = require('web3').utils.BN;

module.exports = {
  'whitelist': {
    contractName: 'QuantstampAuditData',
    methodName: 'addNodeToWhitelist',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      return argv.p;
    }
  },
  'whitelist-owner-in-data-contract': {
    contractName: 'QuantstampAuditData',
    methodName: 'addAddressToWhitelist',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      return [require('../truffle.js').networks[stage].account];
    }
  },
  'update-min-price-to-max': {
    contractName: 'QuantstampAuditData',
    methodName: 'setMinAuditPrice',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      let maxUint256 = new BN(0).notn(256);
      return [argv.p[0], maxUint256.toString()];
    }
  },
  'whitelist-audit-contract': {
    contractName: 'QuantstampAuditData',
    methodName: 'addAddressToWhitelist',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      return [await utils.readAddressFromMetadata(stage, 'QuantstampAudit')];
    }
  },
  'set-max-assigned': {
    contractName: 'QuantstampAuditData',
    methodName: 'setMaxAssignedRequests',
    gasLimit: 30000,
    methodArgs: async(stage, argv) => {
      return argv.p;
    }
  },
  'get-next-audit-request': {
    contractName: 'QuantstampAudit',
    methodName: 'getNextAuditRequest',
    gasLimit: 200000,
    methodArgs: async(stage, argv) => {
      return [];
    }
  },
  'resolve': {
    contractName: 'QuantstampAudit',
    methodName: 'resolveErrorReport',
    gasLimit: 200000,
    methodArgs: async(stage, argv) => {
      return argv.p;
    }
  }
};
