#!/usr/bin/env node

const web3 = require('web3');
const truffle = require('../truffle.js');
const definitions = require('./definitions');
const utils = require('../migrations/utils.js');
const callMethod = require('./callmethod.js')

let intervalHandle = null;

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

const network = argv.n;

const definition = definitions[argv.a];
console.log('Definition found:', definition);
if (!definition) {
  // this should never happen, given the restriction by ".choices(...)"
  console.error(`Unsupported action: ${action}`);
}

return Promise.resolve()
  .then(async () => {
    await callMethod.callMethod({
      provider: truffle.networks[network].provider(),
      network,
      contractName: definition.contractName,
      methodName: definition.methodName,
      methodArgsFn: definition.methodArgs.bind(null, network, argv),
      sendArgs: {
        from: truffle.networks[network].account,
        gasPrice: truffle.networks[network].gasPrice,
        gas: definition.gasLimit
      }
    });
  });
