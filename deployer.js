// Script to generate contract deployment manifest 
// To use this script udpate the config in deploy.yml
// which currently  supports only version and network
// specifications.
//
// Once updated, the following script will check 
// meta.json files for each contract in the desired
// environment to find out the last succesfully deployed
// commit hash. It will then determine the contracts
// that have been since updated and will update truffle.js
// file to mark them `true` for deployment
// 
// Next it will generate a script deploy-<network>.sh
// containing truffle migrate and whitelisting command.
//  As the final step, it will update the version in
// package.json to version specified in deploy.yml
// To run the script:
//     node deployer.js

const fs = require('fs')
const yaml = require('js-yaml');
const editJsonFile = require("edit-json-file");
const shell = require('shelljs');
const path = require('path');
const replace = require('replace-in-file');
const aws = require('aws-sdk');
const s3 = new aws.S3();
const definitions = require('./scripts/definitions.js')
const truffle = require('./truffle.js')
const utils = require('./migrations/utils.js')

function getConfig() {
  try {
    var config = yaml.safeLoad(fs.readFileSync('deploy.yml', 'utf8'));
    return config;
  } catch (e) {
    console.log(e);
    return null;
  }
}

function getCurrentVersion() {
  var content = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  return content.version
}

function getAllContractNames() {
  var files = fs.readdirSync('./contracts/').filter(file => file.startsWith('Quantstamp'))
  files = files.map(file => file.split('.')[0])
  return files
}

function updateVersion(network, config) {
  let packageJson = editJsonFile('package.json')
  let version = packageJson.get("version")
  if (config.deploy.version >= version) {
    packageJson.set("version", config.deploy.version)
    packageJson.save()
    console.log(` - ${network.name} -- Version in package.json updated to ${config.deploy.version}`)
  } else throw Error(` - ${network.name} -- New version number should be greater than or equal to current version`)
}

async function getCommitHash(currentVersion, network, contract) {
  let majorVersion = currentVersion.split('.')[0]
  var commitHash = null
  if (network === 'development') {
    commitHash = shell.exec('git rev-parse HEAD', { silent: true }).stdout;
    return commitHash
  }
  var getParams = {
    Bucket: 'qsp-protocol-contract',
    Key: network + '/' + contract + '-v-' + majorVersion + "-meta.json"
  }

  var fileExists = await s3.headObject(getParams).promise().catch(err => {
    if (err.code === 'NotFound') {
      return false
    } else {
      console.log(err)
    }
  })

  if (fileExists === false) {
    commitHash = shell.exec('git log --pretty=format:%H | tail -1', { silent: true }).stdout;
    return commitHash
  }
  var response = await s3.getObject(getParams).promise().catch(err => console.log(err))

  var data = response.Body.toString()
  commitHash = JSON.parse(data).commitHash
  return commitHash
}

function getDiffFiles(commitHash) {
  files = shell.exec('git diff --name-only HEAD ' + commitHash, { silent: true }).stdout.split("\n");
  return files
}

function getUpdatedContractNames(fileNames) {
  let sol = new RegExp('.sol$')
  let files = fileNames.filter(fileName => fileName.match(sol))
  let contractNames = files.map(file => path.parse(file).base.split(".")[0])
  if (contractNames.length <= 0) {
    contractNames = []
  }
  return contractNames
}

function updateTruffle(contractNames) {
  contractNames.forEach(contract => {
    r = '\\s' + contract + '\\s?:\\s?false'
    f = new RegExp(r, 'g')
    const options = {
      files: 'truffle.js',
      from: f,
      to: contract + ": true"
    }
    try {
      const changes = replace.sync(options);
      if (changes.length > 0) {
        console.log(`Truffle.js modified for ${contract}`)
      }
    }
    catch (error) {
      console.error('Error occurred:', error);
    }
  });
}

function writeTruffleCommands(network, deployScript) {
  content = "#!/bin/bash\nset -e\ntruffle migrate --network " + network + " --reset"
  return content
}

function findWhiteListCommands(updatedContractNames) {
  let whitelistDefs = []
  defKeys = Object.keys(definitions)
  updatedContractNames.forEach(updatedContractName => {
    defKeys.forEach(key => {
      method = definitions[key]["methodName"]
      if (method === 'addAddressToWhitelist') {
        Contract = definitions[key]["contractName"]
        asynDef = definitions[key]["methodArgs"].toString()
        if (contract === updatedContractName || asynDef.includes(updatedContractName)) {
          whitelistDefs.push(key)
        }
      }
    })
  })
  whitelistDefs = [...new Set(whitelistDefs)]
  return whitelistDefs
}


function writeContractWhiteListCommands(network, whiteListDefs) {
  commands = []
  whiteListDefs.forEach(whitelistDef => {
    commands.push(`\nnpm run command -- -n=${network} -a=${whitelistDef}`)
  })
  return commands.join("")
}

function getNodes(network, type) {
  if (type === 'police') {
    nodes = truffle.networks[network].policeNodes
  } else if (type === 'audit') {
    nodes = truffle.networks[network].auditNodes
  }
  if (!nodes) {
    nodes = []
  }
  return nodes
}

function getPoliceNodes(network) {
  policeNodes = truffle.networks[network].policeNodes
  if (policeNodes === undefined) {
    policeNodes = []
  }
  return policeNodes
}
function writePoliceWhiteListCommands(network, policeNodes) {
  commands = []
  policeNodes.forEach(policeNode => {
    commands.push("\nnpm run command -- -n=" + network + " -a=whitelist-police-node -p " + policeNode)
  })
  return commands.join("")
}

function writeGitDiscardCommands() {
  content = "\ngit checkout -- truffle.js\n"
  return content
}

function IsValidNetwork(network) {
  validNetworks = Object.keys(truffle.networks)
  return validNetworks.includes(network)
}

function writeApproveAndStakeCommands(network, nodes, type) {
  commands = []
  nodes.forEach(node => {
    commands.push(`\nnode ./approve-and-stake.js -a ${node} --approve 10000 --stake 10000 -n ${network} -t ${type}`)
  })
  return commands.join("")
}
function main() {
  let config = getConfig()
  if (!config) {
    process.exit()
  }

  let allContracts = getAllContractNames()

  config.deploy.network.forEach(async (network) => {
    if (!IsValidNetwork(network.name)) {
      throw (` - ${network.name} --  Not a valid network: ${network.name}`)
    }
    var updatedContractNames = []
    var currentVersion = getCurrentVersion()

    writeTruffleCommands(network.name, deployScript)

    console.log(` - ${network.name} -- Checking commit hashes...`)
    for (i = 0; i < allContracts.length; i++) {
      contract = allContracts[i]
      let commitHash = await getCommitHash(currentVersion, network.name, contract)
      if (commitHash !== null) {
        let fileNames = getDiffFiles(commitHash)
        updatedContractNames = updatedContractNames.concat(getUpdatedContractNames(fileNames))
      } else {
        console.log(` - ${network.name} -- Could not find a commit hash for current major version for contract: ${contract}`)
      }
    }
    if (updatedContractNames.length > 0) {
      console.log(` - ${network.name} -- Found updated contracts...`)
      try {
        var deployScript = fs.createWriteStream("deploy-" + network.name + ".sh", { mode: '744', flag: 'w' })
        updatedContractNames = [...new Set(updatedContractNames)]
        updateTruffle(updatedContractNames)
        deployScript.write(writeTruffleCommands(network.name))
        console.log(` - ${network.name} -- Wrote truffle migrate command to ${deployScript.path}`)
        var whitelistDefs = findWhiteListCommands(updatedContractNames)
        if (whitelistDefs.length > 0) {
          deployScript.write(writeContractWhiteListCommands(network.name, whitelistDefs))
          console.log(` - ${network.name} -- Wrote whitelist commands to ${deployScript.path}`)
        }
        var policeNodes = getNodes(network.name, 'police')
        if (policeNodes.length > 0) {
          deployScript.write(writePoliceWhiteListCommands(network.name, policeNodes))
          console.log(` - ${network.name} -- Wrote police whitelist commands to ${deployScript.path}`)
          deployScript.write(writeApproveAndStakeCommands(network.name, policeNodes, 'police'))
          console.log(` - ${network.name} -- Wrote approve and stake commands to ${deployScript.path} for police nodes`)
        }

        var auditNodes = getNodes(network.name, 'audit')
        if (auditNodes.length > 0) {
          deployScript.write(writeApproveAndStakeCommands(network.name, auditNodes, 'audit'))
          console.log(` - ${network.name} -- Wrote approve and stake commands to ${deployScript.path} for audit nodes`)
        }
        deployScript.write(writeGitDiscardCommands())
        updateVersion(network, config)
        if (!updatedContractNames.includes('LinkedListLib')) {
          Promise.resolve(utils.updateBuildContract(network.name, 'LinkedListLib'))
          .then(result => {
            if (result) {
              console.log(` - ${network.name} -- Updated build contract for LinkedListLib`)
          }})
          .catch(err => {
            console.log(` - ${network.name} -- Failed to update build contract for LinkedListLib`)
            console.log(err)
          })
        }
      } catch (err) {
        fs.unlinkSync(deployScript.path)
        throw (err)
      }
    }
    else console.log(` - ${network.name} -- No contract updated since last deploy`)
  })
}

main()