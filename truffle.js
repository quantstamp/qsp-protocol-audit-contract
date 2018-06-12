const credentials = require("./credentials.js");
const HDWalletProvider = require("truffle-hdwallet-provider");

module.exports = {
  deploy: {
    QuantstampAuditData: false,
    QuantstampAudit: true,
    QuantstampAuditView: false
  },
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*", // Match any network id
      gas: 4700000
    },
    stage_dev: {
      provider: new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/${credentials.infura_apikey}`),
      network_id: 3,
      gas: 4612388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    },
    stage_prod: {
      provider: new HDWalletProvider(credentials.mnemonic, `https://mainnet.infura.io/${credentials.infura_apikey}`),
      network_id: 1,
      gas: 4612388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    },
    ropsten: {
      provider: new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/${credentials.infura_apikey}`),
      network_id: 3,
      gas: 4612388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    }
  }
};
