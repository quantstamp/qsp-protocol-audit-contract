// Script to verify contracts on etherscan
// To use need to specify the contract name and the network
// npm run -- verify-contract -c <contract> -n <network>

const flatten = require('truffle-flattener');
const abi = require('ethereumjs-abi')
const fs = require('fs');
const yargs = require('yargs');
const rp = require('request-promise');
const credentials = require("./credentials.js");
const utils = require('./migrations/utils');
const truffle = require('./truffle.js');

const argv = yargs
  .option({
    c: {
      demand: true,
      alias: 'contract',
      describe: 'Contract Name',
      string: true,
      requiresArg: true
    },
    n: {
      demand: true,
      alias: 'network',
      describe: 'QSP network',
      choices: Object.keys(truffle.networks),
      string: true
    }
  })
  .help()
  .alias('help', 'h')
  .argv;


async function getContractAddress(network, contractName) {
  const address = await utils.readAddressFromMetadata(network, contractName);
  return address;
}

async function getConstructorInputs(network, contractName) {
  const abi = await utils.readAbi(network, contractName);
  const contructorObj = abi.find(function(c) {return c.type === "constructor"});
  if (contructorObj) {
    return contructorObj.inputs
  }
  console.log(`No constructor found for contract ${contractName}`);
  return null;
}

async function getConstructorValue(network,argObj) {
  const contractNames = {
    escrowAddress: "QuantstampAuditTokenEscrow",
    auditDataAddress: "QuantstampAuditData",
    tokenAddress: "QuantstampToken",
    reportDataAddress: "QuantstampAuditReportData",
    policeAddress: "QuantstampAuditPolice"
  }
  if (argObj.type === 'address') {
    contractName = contractNames[argObj.name];
    return await getContractAddress(network, contractName); 
  } 

  return null;
}

async function getConstructor(network, contractName) {
  var inputs = await getConstructorInputs(network, contractName);
  var contractConstructor = {
    argValue: [],
    argName: [],
    argType: []
  }
  if (inputs) {
    for (var i = 0; i < inputs.length; i++) {
      let value = await getConstructorValue(network, inputs[i]);
      if (value) {
        constructorObj.argName.push(inputs[i].name);
        constructorObj.argValue.push(value);
        constructorObj.argType.push(inputs[i].type);
      } else {
        throw new Error(`Could not determine correct value for constructor argument ${inputs[i].name}`);
      }
    }
    return constructorObj;

  }
  return null;
}

function abiEncodedConstructor(constructorObj) {
  return abi.rawEncode(constructorObj.argType, constructorObj.argValue).toString('hex')
}

function fetchOptimizationInfo() {
  return {
    enabled: (truffle.solc.optimizer.enabled ? 1: 0),
    runs: truffle.solc.optimizer.runs
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkVerificationStatus(data, uri) {
  const options = {
    method: 'GET',
    uri: uri,
    json: true,
    form: data
  }
  return await rp(options);
}

return Promise.resolve()
  .then(async() => {
    if (argv.network === "development") {
      console.log("Skipping verification for development network");
      return;
    }
    let flat = await flatten([`./contracts/${argv.contract}.sol`])
    fs.writeFileSync('flat.sol', flat);
    const contractAddress = await getContractAddress(argv.network, argv.contract);
    const optimizationInfo = fetchOptimizationInfo();
    const uri = truffle.networks[argv.network].etherscanApiUrl
    const compilerversion = 'v0.4.25+commit.59dbf8f1';

    console.log(`Contract Name: ${argv.contract}`);
    console.log(`Contract address: ${contractAddress}`);
    console.log(`Verifying contract on ${argv.network}`)
    console.log(`Compiler version: ${compilerversion}`)
    let data = {
      apikey: credentials.etherscan_apikey,
      module: 'contract',
      action: 'verifysourcecode',
      contractaddress: contractAddress,
      sourceCode: flat,
      contractname: argv.contract,
      compilerversion: compilerversion,
      optimizationUsed: optimizationInfo.enabled,
      runs: String(optimizationInfo.runs),
      libraryname1: "",
      libraryaddress1: "",
      libraryname2: "",
      libraryaddress2: "",
      libraryname3: "",
      libraryaddress3: "",
      libraryname4: "",
      libraryaddress4: "",
      libraryname5: "",
      libraryaddress5: "",
      libraryname6: "",
      libraryaddress6: "",
      libraryname7: "",
      libraryaddress7: "",
      libraryname8: "",
      libraryaddress8: "",
      libraryname9: "",
      libraryaddress9: "",
      libraryname10: "",
      libraryaddress10: ""
    } 

    const contractConstructor = await getConstructor(argv.network, argv.contract);
    if (contractConstructor) {
      data.constructorArguements = abiEncodedConstructor(contractConstructor);
      console.log(`ABI encoded constructor: ${data.constructorArguements}`);
    }
    const contractSol = fs.readFileSync(`./contracts/${argv.contract}.sol`)
    if (contractSol.includes('./LinkedListLib.sol')) {
      console.log(`Contract ${argv.contract} uses LinkedListLib`);
      const libName = 'LinkedListLib';
      const linkedListLibAddress = await getContractAddress(argv.network, libName);
      console.log(`linkedListLibAddress: ${linkedListLibAddress}`);
      data.libraryname1 = libName;
      data.libraryaddress1 = linkedListLibAddress;
    }

    const options = {
      method: 'POST',
      uri: uri,
      form: data,
      json: true,
    }
    const result = await rp(options);
    
    if(result.status == 0) {
      throw new Error(result.result);
    } 
    const verificationObj = {
      guid: result.result,
      module: 'contract',
      action: 'checkverifystatus',
    }
    console.log(`Verification guid: ${result.result}`)

    let count = 10;
    while (count > 0) {
      await sleep(3000)
      const status = await checkVerificationStatus(verificationObj, uri)
      if (status.result == 'Pending in queue') {
        console.log("Verification pending...")
      }
      else {
        console.log(status);
        return;
      }
      count--;
    }
    throw new Error('Contract verification timed out. Please check status on etherscan manually using the guid');
}).catch(err => console.log(err));
