const credentials = require("./credentials.js");
const HDWalletProvider = require("truffle-hdwallet-provider");
const TrezorWalletProvider = require("@daonomic/trezor-wallet-provider/trezor_wallet_provider.js");


module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  deploy: {
    QuantstampAuditData: false,
    QuantstampAuditMultiRequestData: false,
    QuantstampAuditReportData: false,
    QuantstampAudit: false,
    QuantstampAuditView: false,
    QuantstampAuditTokenEscrow: false,
  },
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*", // Match any network id
      gas: 5712388 // TODO change string->byte32. The gas usage increased due to changes for QSP-425. One suggestion for decreasing the gas is to change string to bytes32.
    },
    dev: {
      provider:  function() {
        return new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/${credentials.infura_apikey}`);
      },
      network_id: 3,
      gas: 4007806,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    },
    staging: {
      provider:  function() {
        return new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/${credentials.infura_apikey}`);
      },
      network_id: 3,
      gas: 4007806,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    },
    'dev-consensys': {
      provider:  function() {
        return new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/${credentials.infura_apikey}`);
      },
      network_id: 3,
      gas: 4712388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    },
    prod: {
      provider: function() {
        return TrezorWalletProvider.getInstance(`https://mainnet.infura.io/${credentials.infura_apikey}`);
      },
      network_id: 1,
      gas: 4012388,
      gasPrice: 14000000000,
      account: '0x8FD88a2457f74Ec62e6115B2Eb20f05F24B51c62',
      delayBetweenDeploys: 60000
    },
    ropsten: {
      provider: function() {
        return TrezorWalletProvider.getInstance(`https://ropsten.infura.io/${credentials.infura_apikey}`);
      },
      network_id: 3,
      gas: 4712388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2'
    }
  }
};
