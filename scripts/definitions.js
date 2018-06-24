'use strict';

const utils = require('../migrations/utils.js');

module.exports = {
  'whitelist': {
    contractName: 'QuantstampAudit',
    methodName: 'addAddressToWhitelist',
    gasLimit: 80000,
    methodArgs: (stage, argv) => {
      return [utils.readAddressFromMetadata(stage, 'QuantstampAudit')];
    }
  },
  'whitelist-audit-contract': {
    contractName: 'QuantstampAuditData',
    methodName: 'addAddressToWhitelist',
    gasLimit: 26000,
    methodArgs: (stage, argv) => {
      return [argv.p];
    }
  },
  'set-max-assigned': {
    contractName: 'QuantstampAuditData',
    methodName: 'setMaxAssignedRequests',
    gasLimit: 30000,
    methodArgs: (stage, argv) => {
      return [argv.p];
    }
  }
}
