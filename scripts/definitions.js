'use strict';

const utils = require('../migrations/utils.js');

module.exports = {
  'whitelist': {
    contractName: 'QuantstampAuditData',
    methodName: 'addNodeToWhitelist',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      return [argv.p];
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
      return [argv.p];
    }
  },
  'get-next-audit-request': {
    contractName: 'QuantstampAudit',
    methodName: 'getNextAuditRequest',
    gasLimit: 200000,
    methodArgs: async(stage, argv) => {
      return [];
    }
  }
}
