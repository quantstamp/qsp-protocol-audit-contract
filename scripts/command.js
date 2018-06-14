#!/usr/bin/env node

const web3 = require('web3');
const truffle = require('../truffle.js');
const ACTION_WHITELIST_AUDIT_CONTRACT = 'whitelist-audit-contract';
const STAGE_DEV = 'dev';
const STAGE_PROD = 'prod';
const utils = require('../migrations/utils.js');
const WHITELIST_FUNCTION_GAS_LIMIT_WEI = 26000;

async function callMethod({provider, stage, contractName, methodName, methodArgs, sendArgs}) {
  const contractAbi = await utils.readAbi(stage, contractName);
  const contractAddress = await utils.readAddressFromMetadata(stage, contractName);
  const contractInstance = new provider.eth.Contract(contractAbi, contractAddress);

  return new Promise(resolve => {
    contractInstance.methods[methodName](...methodArgs)
      .send(sendArgs, function(err, hash) {
        if (err) {
          console.log(`${methodName}(...): transaction errored: "${err.message}"`);
          resolve(err);
        } else {
          console.log(`${methodName}(...): transaction sent, tx hash: "${hash}". You can track its status on Etherscan`);
        }
      }).on('receipt', function(receipt) {
        console.log(`${methodName}(...): transaction receipt`, JSON.stringify(receipt));
        resolve(receipt);
      });
  });
}

const argv = require('yargs')
  .usage('node ./scripts/command.js -a=whitelist-audit-contract -s=dev')
  .alias('s', 'stage')
  .nargs('s', 1)
  .describe('s', 'Provide the stage')
  .demandOption(['s'])
  .choices('s', [STAGE_DEV, STAGE_PROD])
  .alias('a', 'action')
  .nargs('a', 1)
  .describe('a', 'Provide an action')
  .choices('a', [ACTION_WHITELIST_AUDIT_CONTRACT])
  .demandOption(['a'])
  .help('h')
  .alias('h', 'help')
  .argv;

const stage = argv.s;
const network = `stage_${stage}`;
const action = argv.a;

switch (action) {
  case ACTION_WHITELIST_AUDIT_CONTRACT:
    return Promise.resolve()
      .then(async() => await callMethod({
        provider: new web3(truffle.networks[network].provider),
        stage,
        contractName: 'QuantstampAuditData',
        methodName: 'addAddressToWhitelist',
        methodArgs: [
          await utils.readAddressFromMetadata(stage, 'QuantstampAudit')
        ],
        sendArgs: {
          from: truffle.networks[network].account,
          gasPrice: truffle.networks[network].gasPrice,
          gas: WHITELIST_FUNCTION_GAS_LIMIT_WEI
        }
      }));
  default:
    // this should never happen, given the restriction by ".choices(...)"
    console.error(`Unsupported action: ${action}`);
}
