#!/usr/bin/env node

const web3 = require('web3');
const truffle = require('../truffle.js');
const definitions = require('./definitions');
const STAGE_DEV = 'dev';
const STAGE_PROD = 'prod';
const utils = require('../migrations/utils.js');

async function callMethod({provider, stage, contractName, methodName, methodArgs, sendArgs}) {
  console.log('callMethod(...)');
  console.log('- stage:', stage);
  console.log('- contractName:', contractName);
  console.log('- methodName:', contractName);
  console.log('- methodArgs:', methodArgs);
  console.log('- sendArgs:', sendArgs);
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

const expectedStages = Object.keys(truffle.networks).filter(
  item =>  !['development', 'stage_dev', 'stage_prod'].includes(item)).concat([STAGE_DEV, STAGE_PROD]);
const actions = Object.keys(definitions);

const argv = require('yargs')
  .usage('node ./scripts/command.js -a=whitelist-audit-contract -s=dev')
  .alias('s', 'stage')
  .nargs('s', 1)
  .describe('s', 'Provide the stage')
  .demandOption(['s'])
  .choices('s', expectedStages)
  .alias('a', 'action')
  .nargs('a', 1)
  .describe('a', 'Provide an action')
  .choices('a', actions)
  .demandOption(['a'])
  .alias('p', 'parameter')
  .nargs('p', 1)
  .describe('p', 'Provide a parameter for the action')
  .help('h')
  .alias('h', 'help')
  .argv;

const stage = argv.s;
const network = stage === 'dev' || stage === 'prod'? `stage_${stage}` : stage;
const definition = definitions[argv.a];
console.log('Definition found:', definition);
if (!definition) {
  // this should never happen, given the restriction by ".choices(...)"
  console.error(`Unsupported action: ${action}`);
}

return Promise.resolve()
  .then(async() => await callMethod({
    provider: new web3(truffle.networks[network].provider),
    stage,
    contractName: definition.contractName,
    methodName: definition.methodName,
    methodArgs: await definition.methodArgs(stage, argv),
    sendArgs: {
      from: truffle.networks[network].account,
      gasPrice: truffle.networks[network].gasPrice,
      gas: definition.gasLimit
    }
  }));


