const yargs = require('yargs');
const AWS = require('aws-sdk');
const HDWalletProvider = require("truffle-hdwallet-provider");
const web3 = require('web3');
const Accounts = require('web3-eth-accounts');

const utils = require('./migrations/utils');
const truffle = require('./truffle.js');
const command = require('./scripts/callmethod.js')
const credentials = require("./credentials.js");


AWS.config.update({ region: 'us-east-1' });
const argv = yargs
  .option({
    a: {
      demand: true,
      alias: 'address',
      describe: 'Node address',
      string: true,
      requiresArg: true
    },
    n: {
      demand: true,
      alias: 'network',
      describe: 'QSP network',
      choices: Object.keys(truffle.networks),
      string: true
    },
    t: {
      demand: true,
      alias: 'type',
      describe: 'QSP network',
      choices: ['police', 'audit'],
      string: true,
      requiresArg: true
    },
    approve: {
      describe: 'Amount to approve',
      type: 'number',
    },
    stake: {
      describe: 'Amount to stake',
      type: 'number',
    }
  })
  .check(function (argv) {
    if (argv.approve || argv.stake) {
      return true
    } else {
      throw (new Error("One of the two is required: approve or stake"))
    }
  })
  .help()
  .alias('help', 'h')
  .argv;


async function getKeystoreInfo(network, type, address) {
  const ddb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
  const table = `qsp-protocol-${type}-${network}-keystore`
  const params = {
    TableName: table,
    IndexName: 'address-index',
    ProjectionExpression: 'ATTRIBUTE_NAME',
    ExpressionAttributeValues: {
      ':a': { S: address }
    },
    KeyConditionExpression: 'address = :a',
    ProjectionExpression: 'keystore, address, passphrase'
  };
  keystoreObject = await ddb.query(params).promise().catch(err => console.log(err))
  if (keystoreObject.Items === []) {
    throw (new Error("Cannot find matching keystore file in dynamo db"))
  }

  return parseKeystoreInfo(keystoreObject.Items)
}

function parseKeystoreInfo(keystoreInfo) {
  return {
    passphrase: keystoreInfo['0']['passphrase']['S'],
    address: keystoreInfo['0']['address']['S'],
    keystore: keystoreInfo['0']['keystore']['S']
  }

}

function getProvider(privateKey, endpoint) {
  return new HDWalletProvider(privateKey, endpoint)
}
function getWeb3Provider(provider) {
  return new web3(provider)
}

function getPrivateKey(accounts, keystoreObject) {
  return accounts.decrypt(keystoreObject.keystore.toLowerCase(), keystoreObject.passphrase);
}

async function getContractAddress(network, contractName) {
  const address = await utils.readAddressFromMetadata(network, contractName)
  return address
}
async function getContractInstance(web3Provider, network, contractName) {
  const address = await getContractAddress(network, contractName)
  const abi = await utils.readAbi(network, contractName)
  const instance = new web3Provider.eth.Contract(abi, address, {
    gas: truffle.networks[network].gas,
    gasPrice: truffle.networks[network].gasPrice
  });
  return instance
}

return Promise.resolve()
  .then(async () => {
    const infura_apikey = credentials.infura_apikey
    if (!infura_apikey) {
      console.log("Infura key should not be empty. Please check credentials.js file.")
      process.exit()
    }
    const nodeAdress = argv.address.toLowerCase()
    const accounts = new Accounts(`https://ropsten.infura.io/${infura_apikey}`);
    const keystoreObject = await getKeystoreInfo(argv.network, argv.type, nodeAdress)
    const privateKey = getPrivateKey(accounts, keystoreObject)
    const provider = getProvider(privateKey.privateKey, `https://ropsten.infura.io/${infura_apikey}`)
    const web3Provider = getWeb3Provider(provider)
    const auditContractAddress = await getContractAddress(argv.network, 'QuantstampAudit')

    if (argv.approve) {
      console.log(`Approve audit contract ${auditContractAddress} to spend ${argv.approve} QSP for ${nodeAdress}`)
      await command.callMethod({
        provider: provider,
        network: argv.network,
        contractName: 'QuantstampToken',
        methodName: 'approve',
        methodArgsFn: () => { return [auditContractAddress, utils.toQsp(argv.approve)] },
        sendArgs: {
          from: nodeAdress,
          gas: truffle.networks[argv.network].gas,
          gasPrice: truffle.networks[argv.network].gasPrice
        }
      })
    }
    if (argv.stake) {
      console.log(`Stake ${argv.stake} QSP for ${nodeAdress}`)
      await command.callMethod({
        provider: provider,
        network: argv.network,
        contractName: 'QuantstampAudit',
        methodName: 'stake',
        methodArgsFn: () => { return [utils.toQsp(argv.stake)] },
        sendArgs: {
          from: nodeAdress,
          gas: truffle.networks[argv.network].gas,
          gasPrice: truffle.networks[argv.network].gasPrice
        }
      })
    }
  }).catch(err => console.log(err));