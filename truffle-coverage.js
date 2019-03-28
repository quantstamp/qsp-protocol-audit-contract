module.exports = {
  solc: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  networks: {
    development: {
      host: "localhost",
      network_id: "*",
      port: 7545,
      gas: 0xfffffffffff,
      gasPrice: 0x01
    }
  }
};
