const web3 = require('web3');
const utils = require('../migrations/utils.js');

async function callMethod({provider, network, contractName, methodName, methodArgsFn, sendArgs}) {

    new Promise((resolve, reject) => {
      intervalHandle = setInterval(() => {
        new Promise(() => {
          if (provider.engine.currentBlock != null) {
            clearInterval(intervalHandle);
            resolve(null);
          }
        }).catch(reject)
      }, 1000)
    })
      .then(async () => {
        const web3Provider = new web3(provider);
        console.log('callMethod(...)');
        console.log('- network:', network);
        console.log('- contractName:', contractName);
        console.log('- methodName:', methodName);
        const methodArgs = await methodArgsFn();
        console.log('- methodArgs:', methodArgs);
        console.log('- sendArgs:', sendArgs);
        const contractAbi = await utils.readAbi(network, contractName);
        const contractAddress = await utils.readAddressFromMetadata(network, contractName);
        const contractInstance = new web3Provider.eth.Contract(contractAbi, contractAddress);
  
        return new Promise(resolve => {
          contractInstance.methods[methodName](...methodArgs)
            .send(sendArgs, function (err, hash) {
              if (err) {
                console.log(`${methodName}(...): transaction errored: "${err.message}"`);
                resolve(err);
              } else {
                console.log(`${methodName}(...): transaction sent, tx hash: "${hash}". You can track its status on Etherscan`);
              }
            }).on('receipt', function (receipt) {
            console.log(`${methodName}(...): transaction receipt`, JSON.stringify(receipt));
            resolve(receipt);
            process.exit();
          }).catch(function(err) {
            console.error(err);
            process.exit();
          });
        });
      });
}

module.exports = {
    callMethod: callMethod
}