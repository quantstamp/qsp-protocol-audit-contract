'use strict';

const utils = require('../migrations/utils.js');
const BN = require('web3').utils.BN;
const Web3 = require('web3');

module.exports = {
  'whitelist-police-node': {
    contractName: 'QuantstampAuditPolice',
    methodName: 'addPoliceNode',
    gasLimit: 100000,
    methodArgs: async(stage, argv) => {
      return argv.p;
    }
  },
  'unwhitelist-police-node': {
    contractName: 'QuantstampAuditPolice',
    methodName: 'removePoliceNode',
    gasLimit: 90000,
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
  'set-min-price-to-accept-any-request': {
    contractName: 'QuantstampAuditData',
    methodName: 'setMinAuditPrice',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      return [argv.p[0], "0"];
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
  'whitelist-audit-contract-in-report-data': {
    contractName: 'QuantstampAuditReportData',
    methodName: 'addAddressToWhitelist',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      return [await utils.readAddressFromMetadata(stage, 'QuantstampAudit')];
    }
  },
  'whitelist-police-contract-in-escrow': {
    contractName: 'QuantstampAuditTokenEscrow',
    methodName: 'addAddressToWhitelist',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      return [await utils.readAddressFromMetadata(stage, 'QuantstampAuditPolice')];
    }
  },
  'whitelist-audit-contract-in-escrow': {
    contractName: 'QuantstampAuditTokenEscrow',
    methodName: 'addAddressToWhitelist',
    gasLimit: 80000,
    methodArgs: async(stage, argv) => {
      return [await utils.readAddressFromMetadata(stage, 'QuantstampAudit')];
    }
  },
  'whitelist-audit-contract-in-police': {
    contractName: 'QuantstampAuditPolice',
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
  'set-min-stake': {
    contractName: 'QuantstampAuditTokenEscrow',
    methodName: 'setMinAuditStake',
    gasLimit: 130000,
    methodArgs: async(stage, argv) => {
      return argv.p;
    }
  },
  'set-min-audit-price-lower-cap': {
    contractName: 'QuantstampAudit',
    methodName: 'setMinAuditPriceLowerCap',
    gasLimit: 130000,
    methodArgs: async(stage, argv) => {
      return argv.p;
    }
  },
  'set-slash-percentage': {
    contractName: 'QuantstampAuditPolice',
    methodName: 'setSlashPercentage',
    gasLimit: 130000,
    methodArgs: async(stage, argv) => {
      return argv.p;
    }
  },
  'set-audit-contract-address-in-view': {
    contractName: 'QuantstampAuditView',
    methodName: 'setQuantstampAudit',
    gasLimit: 130000,
    methodArgs: async(stage, argv) => {
      return [await utils.readAddressFromMetadata(stage, 'QuantstampAudit')];
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
