'use strict';

const utils = require('../migrations/utils.js');
const BN = require('web3').utils.BN;
const Web3 = require('web3');

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
      const contractAddress = await utils.readAddressFromMetadata(stage, 'QuantstampAuditData');
      const contractAbi = await utils.readAbi(stage, 'QuantstampAuditData');
      const web3Provider = new Web3(require('../truffle.js').networks[stage].provider());
      const contractInstance = new web3Provider.eth.Contract(contractAbi, contractAddress);
      const owner = await contractInstance.methods.owner().call();
      return [owner];
    }
  },
  'reset-min-price': {
    contractName: 'QuantstampAuditData',
    methodName: 'setMinAuditPrice',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      let maxUint256 = new BN(0).notn(256);
      return [argv.p[0], maxUint256.toString()];
    }
  },
  'whitelist-audit-contract-in-data': {
    contractName: 'QuantstampAuditData',
    methodName: 'addAddressToWhitelist',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      return [await utils.readAddressFromMetadata(stage, 'QuantstampAudit')];
    }
  },
  'whitelist-audit-contract-in-multirequest-data': {
    contractName: 'QuantstampAuditMultiRequestData',
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
