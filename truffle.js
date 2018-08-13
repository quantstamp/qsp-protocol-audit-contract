const credentials = require("./credentials.js");
const HDWalletProvider = require("truffle-hdwallet-provider");
const TrezorWalletProvider = require("./scripts/trezor_wallet_provider.js");

module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  deploy: {
    QuantstampAuditData: false,
    QuantstampAudit: false,
    QuantstampAuditView: false
  },
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*", // Match any network id
      gas: 4712388 // TODO change string->byte32. Th gas usage increased due to changes for QSP-425. One suggestion for decreasing the gas is to change string to bytes32.
    },
    dev: {
      provider: new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/${credentials.infura_apikey}`),
      network_id: 3,
      gas: 4712388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    },
    'dev-consensys': {
      provider: new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/${credentials.infura_apikey}`),
      network_id: 3,
      gas: 4712388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    },
    prod: {
      provider: new HDWalletProvider(credentials.mnemonic, `https://mainnet.infura.io/${credentials.infura_apikey}`),
      network_id: 1,
      gas: 4712388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    },
    ropsten: {
      provider: new TrezorWalletProvider(`https://ropsten.infura.io/${credentials.infura_apikey}`),
      network_id: 3,
      gas: 4712388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    }
  }
};
