const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  region: 'us-east-1'
});

// no known audit data addresses yet
const AUDIT_DATA_ADDRESS_MAINNET = "0x0";
const AUDIT_DATA_ADDRESS_ROPSTEN = "0xe536dc77fcaa0c29d68761558affe0b6da66a890";
const AUDIT_ADDRESS_MAINNET = "0x0";
const AUDIT_ADDRESS_ROPSTEN = "0x0";

module.exports = async function(deployer, network, accounts) {

  let stage = null;
  let auditAddress = null;
  let auditDataAddress = null;

  if ("stage_dev" === network) {
    stage = "dev";
    auditAddress = AUDIT_ADDRESS_ROPSTEN;
    auditDataAddress = AUDIT_DATA_ADDRESS_ROPSTEN;
  } else if ("stage_prod" === network) {
    stage = "prod";
    auditAddress = AUDIT_ADDRESS_MAINNET;
    auditDataAddress = AUDIT_DATA_ADDRESS_MAINNET;
  } else if ("ropsten" === network) {
    // useful for deploying to the Ropsten network separately,
    // without affecting Dev or Prod
    auditAddress = AUDIT_ADDRESS_ROPSTEN;
    auditDataAddress = AUDIT_DATA_ADDRESS_ROPSTEN;

  } else {
    // for other networks (e.g., Ganache), the audit_data and audit contract
    // would need to be deployed as well (See 3_deploy_quantstamp_audit_data.js and
    // 3_deploy_quantstamp_audit.js) and their addresses to be used for the
    // Audit contract view
    auditAddress = QuantstampAudit.address;
    auditDataAddress = QuantstampAuditData.address;
  }

  const commitHash = require('child_process')
    .execSync('git rev-parse HEAD')
    .toString().trim();

  // need to use promises explicitly instead of await
  // see: https://github.com/trufflesuite/truffle/issues/713
  await deployer.deploy(QuantstampAuditView, auditAddress, auditDataAddress);

  if (stage) {
    const networkConfig = require('../truffle.js').networks[network];
    const metaUpdateResponse = await s3.putObject({
      Bucket: `qsp-protocol-contract-view-${stage}`,
      Key: "QuantstampAuditView.meta.json",
      ContentType: "application/json",
      Body: new Buffer(JSON.stringify({
        "contractAddress": QuantstampAuditView.address,
        "creatorAddress": networkConfig.account,
        "commitHash": commitHash
      }, null, 2))
    }).promise();
    console.log('Audit View metadata update response:', metaUpdateResponse);

    const auditViewAbiUpdateResponse = await s3.putObject({
      Bucket: `qsp-protocol-contract-view-abi-${stage}`,
      Key: "QuantstampAuditView.abi.json",
      ContentType: "application/json",
      Body: new Buffer(JSON.stringify(
        require('../build/contracts/QuantstampAuditView.json').abi, null, 2
      ))
    }).promise();
    console.log('Audit View contract ABI update response:', auditViewAbiUpdateResponse);
  }
};
