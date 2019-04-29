const truffle = require('../truffle.js');
const AWS = require('aws-sdk');
const web3 = require('web3');
const BN = require('bn.js');
const BigNumber = require('bignumber.js');
const fs = require('fs')

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
    case 'development':
      return defaultArtifact.address;
    case 'dev':
    case 'testnet':
      return QSP_TOKEN_ADDRESS_ROPSTEN;
    case 'mainnet':
      return QSP_TOKEN_ADDRESS_MAINNET;
    default:
      throw new Error ('Unknown stage! Please add support for the stage to tokenAddress(...)');
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

function getFileName(network, contractName, version, type) {
  if (contractName === 'QuantstampToken') {
    return `${network}/${contractName}.${type}.json`;
  }
  return `${network}/${contractName}-v-${version}-${type}.json`;
}

function getMetaFileName(network, contractName, version) {
  return getFileName(network, contractName, version, 'meta');
}

function getAbiFileName(network, contractName, version) {
  return getFileName(network, contractName, version, 'abi');
}

function getArtifactFileName(network, contractName, version) {
  return getFileName(network, contractName, version, 'artifact');
}

async function readAddressFromMetadata(network, contractName) {
  const response = await s3.getObject({
    Bucket: getBucketName(),
    Key: getMetaFileName(network, contractName, getMajorVersion())
  }).promise();
  
  const responseJson = JSON.parse(response.Body.toString());
  console.log(`readAddressFromMetadata(...): ${contractName}:${network}: response JSON`,
    JSON.stringify(responseJson, null, 2));

  return responseJson.contractAddress;
}

async function readAbi(network, contractName) {
  const response = await s3.getObject({
    Bucket: getBucketName(),
    Key: getAbiFileName(network, contractName, getMajorVersion())
  }).promise();

  return JSON.parse(response.Body.toString());
}

async function readArtifact(network, contractName) {
  const response = await s3.getObject({
    Bucket: getBucketName(),
    Key: getArtifactFileName(network, contractName, getMajorVersion())
  }).promise();

  return JSON.parse(response.Body.toString());
}

function readBuildContract(contractName) {
  const contractRaw = fs.readFileSync(`./build/contracts/${contractName}.json`)
  console.log(contractRaw)
  return JSON.parse(contractRaw);
}

async function contractAddress(network, contractName,  defaultArtifact) {
  // defaultArtifact: the smart contract artifact
  // (output of artifacts.require('<contract-name'))
  // whose address will be used when deploying to other networks (e.g., Ganache)
  return network === 'development' ? defaultArtifact.address : await readAddressFromMetadata(network, contractName);
}

async function writeOnS3(bucketName, key, content) {
  return await s3.putObject({
    Bucket: bucketName,
    Key: key,
    ContentType: "application/json",
    Body: content
  }).promise();
}

async function updateAbiAndMetadata(network, contractName, artifact) {
  const contractAddress = artifact.address;
  const transactionHash = artifact.transactionHash;

  if (network === 'development'){
    console.log(`${contractName}: Skipping metadata and ABI update: network "${network}" is not eligible`);
    return;
  }

  const commitHash = require('child_process')
    .execSync('git rev-parse HEAD')
    .toString().trim();

  const networkConfig = truffle.networks[network];
  const metaContent = new Buffer(JSON.stringify({
    "contractAddress": web3.utils.toChecksumAddress(contractAddress),
    "creatorAddress": networkConfig.account,
    "commitHash": commitHash,
    "creationTransaction": transactionHash,
    "version": getVersion()
  }, null, 2));

  const abiContent = new Buffer(JSON.stringify(require(`../build/contracts/${contractName}.json`).abi, null, 2));

  const latestMetaFileName =  getMetaFileName(network, contractName, getMajorVersion());
  const versionedMetaFileName =  getMetaFileName(network, contractName, getVersion());

  const latestAbiFileName = getAbiFileName(network, contractName, getMajorVersion());
  const versionedAbiFileName = getAbiFileName(network, contractName, getVersion());

  const metaUpdateResponse = await writeOnS3(getBucketName(), latestMetaFileName, metaContent);
  console.log(`${contractName}: metadata update response:`, JSON.stringify(metaUpdateResponse, null, 2));

  const versionedMetaUpdateResponse = await writeOnS3(getBucketName(), versionedMetaFileName, metaContent);
  console.log(`${contractName}: versioned metadata update response:`, JSON.stringify(versionedMetaUpdateResponse, null, 2));

  const abiUpdateResponse = await writeOnS3(getBucketName(), latestAbiFileName, abiContent);
  console.log(`${contractName}: ABI update response:`, JSON.stringify(abiUpdateResponse, null, 2));

  const versionedAbiUpdateResponse = await writeOnS3(getBucketName(), versionedAbiFileName, abiContent);
  console.log(`${contractName}: versioned ABI update response:`, JSON.stringify(versionedAbiUpdateResponse, null, 2));
}

async function updateArtifact(network, contractName) {
  if (network === 'development'){
    console.log(`${contractName}: Skipping artifact update: network "${network}" is not eligible`);
    return;
  }

  const artifactContent = new Buffer(JSON.stringify(require(`../build/contracts/${contractName}.json`), null, 2));

  const latestArtifactFileName = getArtifactFileName(network, contractName, getMajorVersion());
  const versionedArtifactFileName = getArtifactFileName(network, contractName, getVersion());

  const artifactUpdateResponse = await writeOnS3(getBucketName(), latestArtifactFileName, artifactContent);
  console.log(`${contractName}: Artifact update response:`, JSON.stringify(artifactUpdateResponse, null, 2));

  const versionedArtifactUpdateResponse = await writeOnS3(getBucketName(), versionedArtifactFileName, artifactContent);
  console.log(`${contractName}: versioned artifact update response:`, JSON.stringify(versionedArtifactUpdateResponse, null, 2));
}

async function updateBuildContract(network, contractName) {
    const artifact = await readArtifact(network, contractName)
    fs.writeFileSync(`./build/contracts/${contractName}.json`, JSON.stringify(artifact), {encoding:'utf8',flag:'w'})
    return true
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

function toEther (n) {
  return new BN(web3.utils.toWei(new BigNumber(n).toString(), "ether"));
}
module.exports = {
  updateAbiAndMetadata,
  updateArtifact,
  tokenAddress,
  contractAddress,
  canDeploy,
  readAbi,
  readArtifact,
  readBuildContract,
  updateBuildContract,
  readAddressFromMetadata,
  toEther : toEther,
  toQsp : toEther,
};
