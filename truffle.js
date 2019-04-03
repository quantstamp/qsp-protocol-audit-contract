const credentials = require("./credentials.js");
const HDWalletProvider = require("truffle-hdwallet-provider");
const TrezorWalletProvider = require("@daonomic/trezor-wallet-provider/trezor_wallet_provider.js");


module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  deploy: {
    LinkedListLib: false,
    QuantstampAuditData: false,
    QuantstampAuditReportData: false,
    QuantstampAuditTokenEscrow: false,
    QuantstampAuditPolice: false,
    QuantstampAudit: false,
    QuantstampAuditView: false
  },
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*", // Match any network id
      gas: 6712388 // TODO change string->byte32. The gas usage increased due to changes for QSP-425. One suggestion for decreasing the gas is to change string to bytes32.
    },
    dev: {
      provider:  function() {
        return new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/v3/${credentials.infura_apikey}`);
      },
      network_id: 3,
      gas: 6712388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2',
      skipDryRun: true,
      policeNodes: [
        '0x3dcad2ecba489945b6935b50c1657b20c00d3d4c'
      ],
      auditNodes: [
        '0xc03038cb6725abdfb225ef10fda3cda3ac2ed3b5'
      ]
    },
    testnet: {
      provider:  function() {
        return new HDWalletProvider(credentials.mnemonic, `https://ropsten.infura.io/${credentials.infura_apikey}`);
      },
      network_id: 3,
      gas: 6712388,
      gasPrice: 110000000000,
      account: '0x0283c049ed4705e2d98c807dbafdaf725f34b8d2',
      skipDryRun: true,
      policeNodes: [
        '0x8F00010986cD2118579c3636EE0EC7810CFaf5D5'
      ],
      auditNodes: [
        '0x2E827414F3a8bAF7d8Df88293B25F13b6cDA53d6'
      ]
    },
    mainnet: {
      provider: function() {
        return TrezorWalletProvider.getInstance(`https://mainnet.infura.io/${credentials.infura_apikey}`);
      },
      network_id: 1,
      gas: 6712388,
      gasPrice: 9000000000,
      account: '0x8FD88a2457f74Ec62e6115B2Eb20f05F24B51c62',
      skipDryRun: true,
      delayBetweenDeploys: 60000,
      policeNodes: [
        '0x66013071e12Cf90dF02F1B3C8149E00a16936f80'
      ],
      auditNodes: [
        '0xB844483b5c833539Cdcc359792bBeae66D317058'
      ]
    }
  }
};
