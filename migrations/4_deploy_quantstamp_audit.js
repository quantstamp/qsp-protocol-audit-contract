const LinkedListLib = artifacts.require("LinkedListLib");
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  region: 'us-east-1'
});

// no known audit data addresses yet
const AUDIT_DATA_ADDRESS_MAINNET = "0x0";
const AUDIT_DATA_ADDRESS_ROPSTEN = "0xe536dc77fcaa0c29d68761558affe0b6da66a890";

module.exports = async function(deployer, network, accounts) {
  let stage = null;
  let auditDataAddress = null;

  if ("stage_dev" === network) {
    stage = "dev";
    auditDataAddress = AUDIT_DATA_ADDRESS_ROPSTEN;
  } else if ("stage_prod" === network) {
    stage = "prod";
    auditDataAddress = AUDIT_DATA_ADDRESS_MAINNET;
  } else if ("ropsten" === network) {
    // useful for deploying to the Ropsten network separately,
    // without affecting Dev or Prod
    auditDataAddress = AUDIT_DATA_ADDRESS_ROPSTEN;
  } else {
    // for other networks (e.g., Ganache), the token contract would need
    // to be deployed as well (See 2_deploy_quantstamp_token.js) and
    // its address to be used for the Audit contract
    auditDataAddress = QuantstampAuditData.address;
  }

  const commitHash = require('child_process')
    .execSync('git rev-parse HEAD')
    .toString().trim();

  // need to use promises explicitly instead of await
  // see: https://github.com/trufflesuite/truffle/issues/713
  await deployer.deploy(LinkedListLib)
    .then(() => deployer.link(LinkedListLib, QuantstampAudit))
    .then(() => deployer.deploy(QuantstampAudit, auditDataAddress));

  if (stage) {
    const networkConfig = require('../truffle.js').networks[network];
    const metaUpdateResponse = await s3.putObject({
      Bucket: `qsp-protocol-contract-abi-${stage}`,
      Key: "QuantstampAudit.meta.json",
      ContentType: "application/json",
      Body: new Buffer(JSON.stringify({
        "contractAddress": QuantstampAudit.address,
        "creatorAddress": networkConfig.account,
        "commitHash": commitHash
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
