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

function updateVersion(config) {
    let packageJson = editJsonFile('package.json')
    let version = packageJson.get("version")
    if (config.deploy.version >= version) {
        packageJson.set("version", config.deploy.version)
        packageJson.save()
        console.log("Version in package.json updated to " + config.deploy.version)
    } else throw Error("New version number should be greater than or equal to current version")
}

async function getCommitHash(currentVersion, network, contract) {
    let majorVersion = currentVersion.split('.')[0]
    var commitHash = null
    if (network === 'development') {
        commitHash = shell.exec('git rev-parse HEAD', {silent:true}).stdout;
        return  commitHash
    }
    var getParams = {
        Bucket: 'qsp-protocol-contract',
        Key: network + '/' + contract + '-v-' + majorVersion + "-meta.json"
    }
    //console.log(getParams)
    var response = await s3.getObject(getParams).promise().catch(err => console.log(err))
    var data = response.Body.toString()
    commitHash = JSON.parse(data).commitHash
    return commitHash
}

function getDiffFiles(commitHash) {
    files = shell.exec('git diff --name-only HEAD ' + commitHash, {silent:true}).stdout.split("\n");
    return files
}

function getUpdatedContractNames(fileNames) {
    let sol = new RegExp('.sol$')
    let files = fileNames.filter(fileName => fileName.match(sol))
    let contractNames = files.map(file => path.parse(file).base.split(".")[0])
    if (contractNames.length > 0) {
        console.log("Found updated contracts")
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
            //console.log('Modified files:', changes.join(', '));
            if (changes.length > 0) {
                console.log("Truffle.js modified for " + contract )
            }
          }
          catch (error) {
            console.error('Error occurred:', error);
          }
    });
}

function writeTruffleCommands(network, deployScript) {
    content= "#!/bin/bash\ntruffle migrate --network " + network + " --reset\n"
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


function writeWhiteListcommands(network, whiteListDefs) {
    commands = []
    whiteListDefs.forEach(whitelistDef => {
        commands.push("npm run command -- -n="  + network+ " -a=" + whitelistDef)
    })
    return commands.join("\n")
}

function writeGitDiscardCommands() {
    content = "\ngit checkout -- truffle.js\n"
    return content
}

function main() {
    let config = getConfig()
    if (!config) {
        process.exit()
    }

    let allContracts = getAllContractNames()

    config.deploy.network.forEach(async (network) => {
        var updatedContractNames = []
        var currentVersion = getCurrentVersion()
        var deployScript = fs.createWriteStream("deploy-" + network.name + ".sh",{mode: '744', flag: 'w'})

        writeTruffleCommands(network.name, deployScript)

        for (i = 0; i < allContracts.length; i++) {
            contract = allContracts[i]
            let commitHash = await getCommitHash(currentVersion, network.name, contract)
            console.log("=======\nChecking commit hash for " + contract + " for version: " + currentVersion)
            console.log("Commit Hash is " + commitHash)
            if (commitHash !== null) {
                let fileNames = getDiffFiles(commitHash)
                updatedContractNames = updatedContractNames.concat(getUpdatedContractNames(fileNames))
            } else {
                console.log("Could not find a commit hash for current major version")
            }
        }
        if (updatedContractNames.length > 0) {
            updatedContractNames = [...new Set(updatedContractNames)]
            console.log("=======\nUpdated contracts are: " + updatedContractNames)
            updateTruffle(updatedContractNames)
            var whitelistDefs = findWhiteListCommands(updatedContractNames)
            if (whitelistDefs.length > 0) {
                console.log("=======\nFound following matching whitelisting definitions: " + whitelistDefs)
            }

            try {
                deployScript.write(writeTruffleCommands(network.name))
                console.log("Wrote truffle migrate command to " +  deployScript.path)
                deployScript.write(writeWhiteListcommands(network.name, whitelistDefs))
                console.log("=======\nWrote whitelist commands to "+  deployScript.path)
                deployScript.write(writeGitDiscardCommands())
                updateVersion(config)
            } catch(err) {
                // undoAllChanges()
                throw(err)
            }
        }
        else console.log("No contract updated since last deploy")
    })
}

main()