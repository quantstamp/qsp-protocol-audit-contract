#!/usr/bin/env node

const web3 = require('web3');
const truffle = require('../truffle.js');
const definitions = require('./definitions');
const utils = require('../migrations/utils.js');

let intervalHandle = null;

async function callMethod({provider, network, contractName, methodName, methodArgs, sendArgs}) {

  new Promise((resolve, reject) => {
    intervalHandle = setInterval(() => {
      new Promise(() => {
        if (provider.engine.currentBlock != null) {
          clearInterval(intervalHandle);
          resolve(null);
        }
      }).catch(reject)
    }, 1000)
  })
    .then(async () => {
      const web3Provider = new web3(provider);
      console.log('callMethod(...)');
      console.log('- network:', network);
      console.log('- contractName:', contractName);
      console.log('- methodName:', methodName);
      console.log('- methodArgs:', methodArgs);
      console.log('- sendArgs:', sendArgs);
      const contractAbi = await utils.readAbi(network, contractName);
      const contractAddress = await utils.readAddressFromMetadata(network, contractName);
      const contractInstance = new web3Provider.eth.Contract(contractAbi, contractAddress);

      return new Promise(resolve => {
        contractInstance.methods[methodName](...methodArgs)
          .send(sendArgs, function (err, hash) {
            if (err) {
              console.log(`${methodName}(...): transaction errored: "${err.message}"`);
              resolve(err);
            } else {
              console.log(`${methodName}(...): transaction sent, tx hash: "${hash}". You can track its status on Etherscan`);
            }
          }).on('receipt', function (receipt) {
          console.log(`${methodName}(...): transaction receipt`, JSON.stringify(receipt));
          resolve(receipt);
          process.exit();
        }).catch(function(err) {
          console.error(err);
          process.exit();
        });
      });
    });
}

const expectedNetworks = Object.keys(truffle.networks).filter(item => !['development'].includes(item));
const actions = Object.keys(definitions);

const argv = require('yargs')
  .usage('node ./scripts/command.js -a=whitelist-audit-contract -n=dev')
  .alias('n', 'network')
  .nargs('n', 1)
  .describe('n', 'Provide the network')
  .demandOption(['n'])
  .choices('n', expectedNetworks)
  .alias('a', 'action')
  .nargs('a', 1)
  .describe('a', 'Provide an action')
  .choices('a', actions)
  .demandOption(['a'])
  .array('p')
  .describe('p', 'Provide parameter(s) for the action')
  .help('h')
  .alias('h', 'help')
  .argv;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const network = argv.n;

const definition = definitions[argv.a];
console.log('Definition found:', definition);
if (!definition) {
  // this should never happen, given the restriction by ".choices(...)"
  console.error(`Unsupported action: ${action}`);
}

return Promise.resolve()
  .then(async () => {
    await callMethod({
      provider: truffle.networks[network].provider,
      network,
      contractName: definition.contractName,
      methodName: definition.methodName,
      methodArgs: await definition.methodArgs(network, argv),
      sendArgs: {
        from: truffle.networks[network].account,
        gasPrice: truffle.networks[network].gasPrice,
        gas: definition.gasLimit
      }
    });
  });
