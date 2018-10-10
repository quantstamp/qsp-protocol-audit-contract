## qsp-protocol-audit-contract

![Build status](https://codebuild.us-east-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiZmNQeU81OEExcy8zZS9vdkpWU3NNQUJDNnVYYTRTbHQvaGE4TExaZXhVcnFFWXY3VjdJRGxyU3IrTk9UNTQzMWJJNk5rdThNZEE4SVUxS3h0QkNPZG0wPSIsIml2UGFyYW1ldGVyU3BlYyI6IkhmZUo3c005aHZRdUdjTloiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=develop)
[![Coverage Status](https://coveralls.io/repos/github/quantstamp/qsp-protocol-audit-contract/badge.svg?branch=develop&t=kDg4aW)](https://coveralls.io/github/quantstamp/qsp-protocol-audit-contract)

QSP Protocol audit contract.

## Access deployed contracts

The addresses of the deployed contracts could be fetched from these locations that persist across deployments. 
Considering the version from `package.json`, the addresses are stored in two locations which are labeled by
major version and full version. The one with major version contains the lasted addresses of the all minor versions.
For example, considering three files `QuantstampAuditData-v-0.1.1-meta.json`, 
`QuantstampAuditData-v-0.1.0-meta.json`, and `QuantstampAuditData-v-0-meta.json`, the last one has the same content
as the first one.

Below is the list of links associated for _V0_. To retrieve the minor versions, replace major version with full 
version in each path. For example, if you want to retrieve address of `QuantstampAudit` for _v0.1.0_, 
change `QuantstampAudit-v-0-meta.json` to `QuantstampAudit-v-0.1.0-meta.json` in the appropriate uri.

### Dev (Ropsten)

1. Audit contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract/dev/QuantstampAudit-v-0-meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract/dev/QuantstampAudit-v-0-abi.json
1. Audit Data contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract/dev/QuantstampAuditData-v-0-meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract/dev/QuantstampAuditData-v-0-abi.json
1. Audit View contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract/dev/QuantstampAuditView-v-0-meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract/dev/QuantstampAuditView-v-0-abi.json

For querying, go to: https://ropsten.etherscan.io/address/{address}#readContract , where `{address}` is `contractAddress` copied from the corresponding metadata file.

### Prod (Main Net)
1. Audit contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract/prod/QuantstampAudit-v-0-meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract/prod/QuantstampAudit-v-0-abi.json
1. Audit Data contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract/prod/QuantstampAuditData-v-0-meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract/prod/QuantstampAuditData-v-0-abi.json
1. Audit View contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract/prod/QuantstampAuditView-v-0-meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract/prod/QuantstampAuditView-v-0-abi.json

For querying, go to: https://etherscan.io/address/{address}#readContract , where `{address}` is `contractAddress` copied from the corresponding metadata file.

## Run locally
### Requirements

* Node.JS v8 with npm

### Steps

1. `npm install`
1. For convenience, install Truffle globally: `npm install -g truffle@0.0.0`, replacing `0.0.0` by the Truffle version from `package.json`
1. Install Ganache (Formerly, `testrpc`), either:
    1. [UI version](http://truffleframework.com/ganache/) of version `1.1.0` or
    1. Console version: `npm install -g ganache-cli@6.1.0` and then (from another terminal tab): `testrpc -p 7545`
1. `truffle compile`
1. `npm test`. To also generate a code coverage report, run `npm run test-cov` instead.
1. To ensure correct commit hooks:
    1. `ln -s -f $(git rev-parse --show-toplevel)/pre-commit $(git rev-parse --show-toplevel)/.git/hooks/pre-commit`
    1. `chmod +x $(git rev-parse --show-toplevel)/.git/hooks/pre-commit`


## CI Tests

The file `buildspec-ci.yml` contains the commands to run on each push.
This includes running Truffle tests and collecting coverage report for [Coveralls](https://coveralls.io/github/quantstamp/qsp-protocol-audit-contract).

## Deploy to Ropsten or Main Net (through MetaMask)

First-time only: manually create the S3 buckets `qsp-protocol-contract-abi-dev` and `qsp-protocol-contract-abi-prod` that will store the ABI and metadata for the deployed contracts. These are necessary so that the audit node and tests can work with the contract without having to update the address.

1. If you haven't, install MetaMask (https://metamask.io).
1. Start MetaMask in the browser (Chrome, Chromium, or Brave) and log in with our credentials.
1. Point MetaMask to the right network (Ropsten or Main Net).
1. Make sure MetaMask is running throughout the deployment process.
1. Place the secret mnemonic phrase and the infura API token into `credentials.js`.
1. If you deploy to Dev or Prod networks of the QSP Protocol, make sure you have AWS credentials that allow write access to the bucket `qsp-protocol-contract/<network>/<contractName>-v-<vesion>-abi.json`. If deployment is successful, the new contract address and the owner address will be written to the corresponding S3 file automatically.
1. Go to `truffle.js` and under `deploy`, set values to `true` for the contracts you would like to deploy.
1. Deploy the contract(s) to the desired network:
    * `truffle migrate --network dev` - QSP protocol dev network.
    * `truffle migrate --network prod` - QSP protocol prod network.
    * `truffle migrate --network ropsten` - Ropsten for independent testing (does not overwrite address from dev or prod network).
1. Whitelist the Audit contract in the Data contract:
    * `npm run command -- -n=dev -a=whitelist-audit-contract-in-data` - for the dev network.
    * `npm run command -- -n=prod -a=whitelist-audit-contract-in-data` - for the prod network.
1. Whitelist the Audit contract in the MultiRequest Data contract:
    * `npm run command -- -n=dev -a=whitelist-audit-contract-in-multirequest-data` - for the dev network.
    * `npm run command -- -n=prod -a=whitelist-audit-contract-in-multirequest-data` - for the prod network.
    
    Note: a successful return of the whitelisting script does not necessarily mean the transaction is fully completed. Please check
    the status manually on a block explorer and wait for the desired number of confirmations.
1. To perform actions on a deployed smart contract, use the following commands:
    * `npm run command -- -n=dev --p <parameters>` - QSP protocol dev network.
    * `npm run command -- -n=prod --p <parameters>` - QSP protocol prod network.
    
    For the full list, check out the next section and `./scripts/definitions.json`. The list is extensible.

In case you want to setup a different environment for testing purposes, follow:

1. Go to `truffle.js` and add a new network, similar to `dev`, such as `test_net`.
1. Deploy the contract(s) by passing the new network name, _e.g.,_ `truffle migrate --network test_net`.
1. Once contract(s) deployed, the addresses are accessible from S3. For example, `qsp-protocol-contract/test_net/QuantstampAudit-v-<vesion>-abi.json`
is a path associated to the version 1 of the `QuantstampAudit` contract deployed on `test_net`.
1. You can run all commands on this network by setting the value `-s` to `npm run command`. For example, for running
`whitelist-audit-contract` on `test_net`, run: `npm run command -s=test_net -- -a=whitelist-audit-contract`.

## Commands

**Note**: before running a command, setup the credentials as described in the section above.

1. `npm run command -- -n=dev -a=whitelist --p 0x123456789` whitelists a node defined by a given address
1. `npm run command -- -n=dev -a=whitelist-owner-in-data-contract` whitelists the owner of the QuantstampAuditData contract (required for updating nodes' min audit price)
1. `npm run command -- -n=dev -a=reset-min-price --p 0x123456789` resets the min price of the given node address to max-uint256
1. `npm run command -- -n=dev -a=set-min-price-to-accept-any-request --p 0x123456789` sets the min price of the given whitelisted node to 0 enabling the [cleanup process](https://quantstamp.atlassian.net/wiki/spaces/QUAN/pages/95354881/Monitoring+Resources#MonitoringResources-Cleaningupauditrequests)
1. `npm run command -- -n=dev -a=set-max-assigned --p 100` sets "maximum assigned nodes"
1. `npm run command -- -n=dev -a=get-next-audit-request` calls `getNextAuditRequest()` on the contract. May be useful for cleaning up the audit waiting queue.
1. `npm run command -- -n=dev -a=resolve --p 1 false` calls `resolveErrorReport()` on the contract to resolve the incentive of a given requestId. If the second parameter is true, the requester is paid; otherwise, the audit node. 

## Deploy to Ganache

`npm test` automatically deploys the contract to Ganache and runs tests against it. However, there is an option of deploying the contract to Ganache manually (e.g., for purposes of manual testing)

### Running standalone
1. Install and start Ganache as described in the steps above
1. `truffle test --network development`
1. `truffle migrate --network development`

### Running in Docker
1. `docker run -d -p 7545:8545 trufflesuite/ganache-cli:latest`
1. `truffle test --network development`
1. `truffle migrate --network development`

## Calculating Minimum Audit Price

Audit nodes need to be profitable to have incentives to operate. They receive payments in QSP tokens, but need to pay for gas (to cover the cost of Ethereum transactions) to interact with the Audit smart contract.

Currently, when a user submits an audit request, multiple nodes try to get the audit, by calling `getNextAuditRequest()` on `QuantstampAudit.sol`, but only one is selected. In a set of N nodes, statistically, each node is chosen once every N attempts. Consequently, the minimum price of an audit needs to be set in such a way that it offsets the N-1 failed attempts.

 For N nodes, to calculate the minimum price per audit, that offsets any costs and loses, call:
 
 `node gas.js suggest_min_price --nodes=N`

The commands fetches the current gas price from Etherscan for calculations. If you wish to specify your own gas price, use the parameter `--gasPrice=X`, where X is the desired gas price in Wei.

## Hardware wallet

Interacting with the smart contracts, one can use a Trezor hardware wallet for signing transaction. All he needs to do are alter `truffle.js`
and set the provider field of a desired network to an instance of `TrezorWalletProvider`.
This class accepts an address of a web3 provider, such as infura.

### prerequisites
#### Trezor Drivers
If you are using the Trezor for the first time on your machine, please visit [trezor.io/start](https://trezor.io/start/)
for installing your device's drivers.
#### Java Runtime Edition
For accepting a wallet PIN, make sure a recent version of [JRE](http://www.oracle.com/technetwork/java/javase/downloads/jre8-downloads-2133155.html)
is executable from the command-line. A successful execution of `java -version` shows the validity of this fact.

Without using a  hardware wallet, one alternatively use `HDWalletProvider` for signing transactions. This wallet accepts 
a mnemonic key and a web3 provider address for signing transactions.  
