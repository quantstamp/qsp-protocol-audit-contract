const truffle = require('../truffle.js');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  region: 'us-east-1'
});

const QSP_TOKEN_ADDRESS_MAINNET = "0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d";
const QSP_TOKEN_ADDRESS_ROPSTEN = "0xc1220b0bA0760817A9E8166C114D3eb2741F5949";

function tokenAddress(network, defaultArtifact) {
  // defaultArtifact: the smart contract artifact
  // (output of artifacts.require('<contract-name'))
  // whose address will be used when deploying to other networks (e.g., Ganache)
  switch(network) {
    case 'dev':
    case 'ropsten':
      // 'ropsten' is useful for deploying to the Ropsten network separately,
      // without affecting Dev or Prod
      return QSP_TOKEN_ADDRESS_ROPSTEN;
    case 'prod':
      return QSP_TOKEN_ADDRESS_MAINNET;
    case 'development':
      return defaultArtifact.address;
    default:
      return QSP_TOKEN_ADDRESS_ROPSTEN;
  }
}

function getVersion() {
  return require('../package.json').version;
}

function getMajorVersion() {
  return getVersion().match(/^[^\.]*/g);
}

function getBucketName() {
  return `qsp-protocol-contract`;
}

function getFileName(stage, contractName, version, type) {
  return `${stage}/${contractName}-v-${version}-${type}.json`;
}

function getMetaFileName(stage, contractName, version) {
  return getFileName(stage, contractName, version, 'meta');
}

function getAbiFileName(stage, contractName, version) {
  return getFileName(stage, contractName, version, 'abi');
}

async function readAddressFromMetadata(stage, contractName) {
  const response = await s3.getObject({
    Bucket: getBucketName(),
    Key: getMetaFileName(stage, contractName, getMajorVersion())
  }).promise();
  
  const responseJson = JSON.parse(response.Body.toString());
  console.log(`readAddressFromMetadata(...): ${contractName}:${stage}: response JSON`,
    JSON.stringify(responseJson, null, 2));

  return responseJson.contractAddress;
}

async function readAbi(stage, contractName) {
  const response = await s3.getObject({
    Bucket: getBucketName(),
    Key: getAbiFileName(stage, contractName, getMajorVersion())
  }).promise();

  return JSON.parse(response.Body.toString());
}

async function contractAddress(network, contractName,  defaultArtifact) {
  // defaultArtifact: the smart contract artifact
  // (output of artifacts.require('<contract-name'))
  // whose address will be used when deploying to other networks (e.g., Ganache)
  const stage = network;
  return stage === 'development' ? defaultArtifact.address : await readAddressFromMetadata(stage, contractName);
}

async function writeOnS3(bucketName, key, content) {
  console.info(bucketName, key);
  return await s3.putObject({
    Bucket: bucketName,
    Key: key,
    ContentType: "application/json",
    Body: content
  }).promise();
}

async function updateAbiAndMetadata(network, contractName, contractAddress) {
  let stage = network;
  if (stage === 'development'){
    console.log(`${contractName}: Skipping metadata and ABI update: network "${network}" is not eligible`);
    return;
  }

  const commitHash = require('child_process')
    .execSync('git rev-parse HEAD')
    .toString().trim();

  const stageConfig = truffle.networks[network];
  const metaContent = new Buffer(JSON.stringify({
    "contractAddress": contractAddress,
    "creatorAddress": stageConfig.account,
    "commitHash": commitHash
  }, null, 2));

  const abiContent = new Buffer(JSON.stringify(require(`../build/contracts/${contractName}.json`).abi, null, 2));

  const latestMetaFileName =  getMetaFileName(stage, contractName, getMajorVersion());
  const versionedMetaFileName =  getMetaFileName(stage, contractName, getVersion());

  const latestAbiFileName = getAbiFileName(stage, contractName, getMajorVersion());
  const versionedAbiFileName = getAbiFileName(stage, contractName, getVersion());

  const metaUpdateResponse = await writeOnS3(getBucketName(), latestMetaFileName, metaContent);
  console.log(`${contractName}: metadata update response:`, JSON.stringify(metaUpdateResponse, null, 2));

  const versionedMetaUpdateResponse = await writeOnS3(getBucketName(), versionedMetaFileName, metaContent);
  console.log(`${contractName}: versioned metadata update response:`, JSON.stringify(versionedMetaUpdateResponse, null, 2));

  const abiUpdateResponse = await writeOnS3(getBucketName(), latestAbiFileName, abiContent);
  console.log(`${contractName}: ABI update response:`, JSON.stringify(abiUpdateResponse, null, 2));

  const versionedAbiUpdateResponse = await writeOnS3(getBucketName(), versionedAbiFileName, abiContent);
  console.log(`${contractName}: versioned ABI update response:`, JSON.stringify(versionedAbiUpdateResponse, null, 2));
}

function canDeploy(network, contractName) {
  if (network === 'development') {
    return true;
  }

  if (truffle.deploy[contractName] !== true) {
    console.log(`${contractName}: Skipping deployment: deploy.${contractName} is not set to the boolean true`);
    return false;
  }

  return true;
}

module.exports = {
  updateAbiAndMetadata,
  tokenAddress,
  contractAddress,
  canDeploy,
  readAbi,
  readAddressFromMetadata
};
