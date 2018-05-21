const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampToken = artifacts.require('test/QuantstampToken');

const QSP_TOKEN_ADDRESS_MAINNET = "0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d";
const QSP_TOKEN_ADDRESS_ROPSTEN = "0xc1220b0bA0760817A9E8166C114D3eb2741F5949";

module.exports = function(deployer, network, accounts) {

  let tokenAddress = null;

  if ("stage_dev" === network) {
    tokenAddress = QSP_TOKEN_ADDRESS_ROPSTEN;
  } else if ("stage_prod" === network) {
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

  if (network === "development") {
    deployer.deploy(QuantstampAuditData, tokenAddress);
  }
};
