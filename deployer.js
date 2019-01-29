const fs = require('fs')
const yaml = require('js-yaml');
const editJsonFile = require("edit-json-file");
const shell = require('shelljs');
const path = require('path');
const replace = require('replace-in-file');

function getConfig() {
try {
    var config = yaml.safeLoad(fs.readFileSync('deploy.yml', 'utf8'));
    return config;
  } catch (e) {
    console.log(e);
    return null;
  }
}

function updateVersion(config) {
    let packageJson = editJsonFile('package.json')
    packageJson.set("version", config.deploy.version)
    packageJson.save()
    console.log("Version updated to " + config.deploy.version)
}

function getCommitHash() {
    let hash = shell.exec('git rev-parse HEAD', {silent:true}).stdout;
    console.log("Commit Hash is " + hash)
    return  hash
}

function getDiffFiles() {
    let commitHash = getCommitHash()
    files = shell.exec('git diff-tree --name-only --no-commit-id -r ' + commitHash, {silent:true}).stdout.split("\n");
    // console.log(files)
    return files
}

function getupdatedContractNames(fileNames) {
    let sol = new RegExp('.sol$')
    let files = fileNames.filter(fileName => fileName.match(sol))
    let contractNames = files.map(file => path.parse(file).base.split(".")[0])
    console.log("Updated contract names are: " + contractNames)
    return contractNames
}

function updateTruffle(contractNames) {
    //let truffle = fs.readFileSync('truffle.js', 'utf8')
    contractNames.forEach(contract => {
        r = '\\s' + contract + '\\s?:\\s?false'
        f = new RegExp(r, 'g')
        // console.log(f)
        const options = {
            files: 'truffle.js', 
            from: f,
            to: contract + ": true"
        }
        try {
            const changes = replace.sync(options);
            //console.log('Modified files:', changes.join(', '));
            if (changes.length > 0) {
                console.log("Truffle.js modfied for " + contract )
            }
          }
          catch (error) {
            console.error('Error occurred:', error);
          }
    });
}

function writeTruffleCommands(config, deployScript) {
    content= "#!/bin/bash\ntruffle migrate --network " + config.deploy.network + " --reset\n"
    //console.log(deployScript)
    try {
        fs.writeFileSync(deployScript, content, {mode: '744', flag: 'w'})
        console.log("Wrote truffle migrate command to deploy.sh")
    } catch(err) {
        // undoAllChanges()
        throw err
    }
}

function findWhiteListCommands(contractNames) {
    let whitelistDefs = []
    let definitions = fs.readFileSync('scripts/definitions.js', 'utf8')
    // console.log(definitions)
    contractNames.forEach(contract => {
        r = '\'(whitelist.*)\':\\s*{\\s*contractName:\\s*\'' + contract + '\',\\s*methodName:\\s*\'addAddressToWhitelist\''
        f = new RegExp(r, 'g')  
        // console.log(f)
        do {
            matches = f.exec(definitions)
            //console.log(matches)
            if (matches !== null && matches.length == 2) {
                whitelistDefs.push(matches[1])
            }
        } while (matches);
    })
    return whitelistDefs
}

function writeWhiteListcommands(config, whitelistDefs, deployScript) {
    whitelistDefs.forEach(whitelistDef => {
        content = "npm run command -- -n="  + config.deploy.network + " -a=" + whitelistDef + "\n"
        try {
            fs.writeFileSync(deployScript, content, {mode: '744', flag: 'a'})
            console.log("Wrote whitelist command for " + whitelistDef + " to deploy.sh")
        } catch(err) {
            // undoAllChanges()
            throw err
        }
    })
}

let config = getConfig()
if (!config) {
    process.exit()
}
let deployScript = "deploy.sh"
let fileNames = getDiffFiles()
let contractNames = getupdatedContractNames(fileNames)
// console.log(contractNames)
updateVersion(config)
updateTruffle(contractNames)
writeTruffleCommands(config, deployScript)
let whitelistDefs = findWhiteListCommands(contractNames)

if (whitelistDefs.length > 0) {
    console.log("Found following matching whitelisting definitions: " + whitelistDefs)
}
writeWhiteListcommands(config, whitelistDefs, deployScript) 
