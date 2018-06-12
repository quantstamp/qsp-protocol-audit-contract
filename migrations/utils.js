const truffle = require('../truffle.js');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  region: 'us-east-1'
});

const QSP_TOKEN_ADDRESS_MAINNET = "0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d";
const QSP_TOKEN_ADDRESS_ROPSTEN = "0xc1220b0bA0760817A9E8166C114D3eb2741F5949";

function tokenAddress(network, defaultArtifact) {
  switch(network) {
    case 'stage_dev':
    case 'ropsten':
      // 'ropsten' is useful for deploying to the Ropsten network separately,
      // without affecting Dev or Prod
      return QSP_TOKEN_ADDRESS_ROPSTEN;
    case 'stage_prod':      
      return QSP_TOKEN_ADDRESS_MAINNET;
    default:
      // for other networks (e.g., Ganache), the token contract would need
      // to be deployed as well (See 2_deploy_quantstamp_token.js) and
      // its address to be used for the Audit contract
      return defaultArtifact.address;
  }
}

async function readAddressFromMetadata(stage, contractName) {
  const response = await s3.getObject({
    Bucket: `qsp-protocol-contract-abi-${stage}`,
    Key: `${contractName}.meta.json`
  }).promise();
  
  const responseJson = JSON.parse(response.Body.toString());
  console.log('response JSON', responseJson);
  return responseJson.contractAddress;
}

async function contractAddress(contractName, network, defaultArtifact) {
  switch(network) {
    case 'stage_dev':
    case 'ropsten':
      // 'ropsten' is useful for deploying to the Ropsten network separately,
      // without affecting Dev or Prod
      return await readAddressFromMetadata('dev', contractName);
    case 'stage_prod':
      return await readAddressFromMetadata('prod', contractName);
    default:
      return defaultArtifact.address;
  }
}

async function updateAbiAndMetadata(network, contractName, contractAddress) {
  let stage;
  switch(network) {
    case 'stage_dev':
      stage = 'dev';
      break;
    case 'stage_prod':      
      stage = 'prod';
      break;
    default:
      console.log(`${contractName}: Skipping metadata and ABI update: network "${network}" is not eligible`);
      return;
  }
  
  const commitHash = require('child_process')
    .execSync('git rev-parse HEAD')
    .toString().trim();

  const stageConfig = truffle.networks[network];
  const metaUpdateResponse = await s3.putObject({
    Bucket: `qsp-protocol-contract-abi-${stage}`,
    Key: `${contractName}.meta.json`,
    ContentType: "application/json",
    Body: new Buffer(JSON.stringify({
      "contractAddress": contractAddress,
      "creatorAddress": stageConfig.account,
      "commitHash": commitHash
    }, null, 2))
  }).promise();
  console.log(`${contractName}: metadata update response:`, metaUpdateResponse);

  const abiUpdateResponse = await s3.putObject({
    Bucket: `qsp-protocol-contract-abi-${stage}`,
    Key: `${contractName}.abi.json`,
    ContentType: "application/json",
    Body: new Buffer(JSON.stringify(
      require(`../build/contracts/${contractName}.json`).abi, null, 2
    ))
  }).promise();
  console.log(`${contractName}: ABI update response:`, abiUpdateResponse);
}

function canDeploy(network, contractName) {
  if (network === 'development') {
    return true;
  }

  if (truffle.deploy[contractName] !== true) {
    console.log(`${contractName}: Skipping deployment: deploy.${contractName} is not set to true`);
    return false;
  }

  return true;
}

module.exports = {
  updateAbiAndMetadata,
  tokenAddress,
  contractAddress,
  canDeploy
};
