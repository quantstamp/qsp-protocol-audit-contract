const LinkedListLib = artifacts.require("LinkedListLib.sol");
const QuantstampToken = artifacts.require('test/QuantstampToken');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  region: 'us-east-1'
});

const QSP_TOKEN_ADDRESS_MAINNET = "0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d";
const QSP_TOKEN_ADDRESS_ROPSTEN = "0xc1220b0bA0760817A9E8166C114D3eb2741F5949";

module.exports = async function(deployer, network, accounts) {

  let stage = null;
  let tokenAddress = null;

  if ("stage_dev" === network) {
    stage = "dev";
    tokenAddress = QSP_TOKEN_ADDRESS_ROPSTEN;
  } else if ("stage_prod" === network) {
    stage = "prod";
    tokenAddress = QSP_TOKEN_ADDRESS_MAINNET;
  } else if ("ropsten" === network) {
    // useful for deploying to the Ropsten network separately,
    // without affecting Dev or Prod
    tokenAddress = QSP_TOKEN_ADDRESS_ROPSTEN;
  } else {
    // for other networks (e.g., Ganache), the token contract would need
    // to be deployed as well (See 2_deploy_quantstamp_token.js) and
    // its address to be used for the Audit contract
    tokenAddress = QuantstampToken.address;
  }

  // need to use promises explicitly instead of await
  // see: https://github.com/trufflesuite/truffle/issues/713
  deployer.deploy(LinkedListLib)
    .then(() => deployer.link(LinkedListLib, QuantstampAudit))
    .then(() => deployer.deploy(QuantstampAudit, tokenAddress))

  if (stage) {
    const networkConfig = require('../truffle.js').networks[network];
    const metaUpdateResponse = await s3.putObject({
      Bucket: `qsp-protocol-contract-abi-${stage}`,
      Key: "QuantstampAudit.meta.json",
      ContentType: "application/json",
      Body: new Buffer(JSON.stringify({
        "contractAddress": QuantstampAudit.address,
        "creatorAddress": networkConfig.account
      }, null, 2))
    }).promise();
    console.log('Interface metadata update response:', metaUpdateResponse);

    const auditAbiUpdateResponse = await s3.putObject({
      Bucket: `qsp-protocol-contract-abi-${stage}`,
      Key: "QuantstampAudit.abi.json",
      ContentType: "application/json",
      Body: new Buffer(JSON.stringify(
        require('../build/contracts/QuantstampAudit.json').abi, null, 2
      ))
    }).promise();
    console.log('Audit contract ABI update response:', auditAbiUpdateResponse);

    const tokenAbiUpdateResponse = await s3.putObject({
      Bucket: `qsp-protocol-contract-abi-${stage}`,
      Key: "QuantstampToken.abi.json",
      ContentType: "application/json",
      Body: new Buffer(JSON.stringify(
        require('../build/contracts/QuantstampToken.json').abi, null, 2
      ))
    }).promise();
    console.log('Token contract ABI update response:', tokenAbiUpdateResponse);
  }
};
