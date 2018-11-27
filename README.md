## qsp-protocol-audit-contract

![Build status](https://codebuild.us-east-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiZmNQeU81OEExcy8zZS9vdkpWU3NNQUJDNnVYYTRTbHQvaGE4TExaZXhVcnFFWXY3VjdJRGxyU3IrTk9UNTQzMWJJNk5rdThNZEE4SVUxS3h0QkNPZG0wPSIsIml2UGFyYW1ldGVyU3BlYyI6IkhmZUo3c005aHZRdUdjTloiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=develop)
[![Coverage Status](https://coveralls.io/repos/github/quantstamp/qsp-protocol-audit-contract/badge.svg?branch=develop&t=kDg4aW)](https://coveralls.io/github/quantstamp/qsp-protocol-audit-contract)

This repository contains contracts for interfacing with the QSP audit protocol.

- `QuantstampAudit.sol` is the main contract used for interfacing with the protocol. It allows, among other things, the users to request audits and query their state, the node operators to stake funds and bid on audits, and handle refunds. It also governs the assignment of audits.
- `QuantstampAuditData.sol` stores information about the audits.
- `QuantstampAuditMultiRequestData.sol` stores information about audits that should be processed by several audit nodes.
- `QuantstampAuditReportData.sol` stores compressed reports on-chain.
- `QuantstampAuditTokenEscrow.sol` holds tokens staked by audit nodes in an escrow.
- `QuantstampAuditView.sol` provides view functionality for the state of the protocol.

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
1. QSP token contract address `0xc1220b0bA0760817A9E8166C114D3eb2741F5949`, ABI: http://api-ropsten.etherscan.io/api?module=contract&action=getabi&address=0xc1220b0bA0760817A9E8166C114D3eb2741F5949&format=raw

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
1. QSP token contract address `0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d`, ABI: http://api.etherscan.io/api?module=contract&action=getabi&address=0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d&format=raw

For querying, go to: https://etherscan.io/address/{address}#readContract , where `{address}` is `contractAddress` copied from the corresponding metadata file.

## Interaction with the protocol

From our target user perspective, interaction with the protocol involves the following steps:
1) Give permission allowing Quantstamp protocol to withdraw QSP tokens from your wallet to pay for one or more audits,
2) Request an automated audit and trigger the actual payment associated with the audit, and
3) Obtain and view your audit report.

Below we describe each step in more details. We assume that you are using JS Web3 API and that the following variables are used in your code:
* `quantstamp_token` is the instantiated QSP token contract,
* `quantstamp_audit` is the instantiated QSP Audit contract,
* `quantstamp_report_data` is the instantiated QSP Audit Report Data contract,
* `requestor` is your address that holds the QSP tokens and that you will use to submit an audit request. You need some ETH to pay for the gas fees, like with any other transaction on Ethereum.

Note that the address and ABI for each contract depends on whether you are on Ropsten or Mainnet. You can find the relevant information in the previous section.

### Step 1: Authorize Quantstamp Protocol to collect your QSP as payment

You can authorize Quantstamp Protocol to collect your QSP as payment as follows:

`await quantstamp_token.approve(quantstamp_audit.address, _value, {from : requestor});`

where:
* `_value` is the total amount of QSP which you are giving permission to withdraw. Please note that this amount needs to be multiplied by 10^18 (similarly to how ETH gets converted into Wei). One way of doing the conversion is via `web3.toWei(n, "ether")`, where `n` is the amount of QSP tokens. The audit price is dynamic and presented on the dashboard: https://qsp-dashboard.quantstamp.com.​ If you want to do three audits and each audit costs 1000 QSP then you would set `​_value`​ to `web3.toWei(3000, "ether")` (as an example). You can keep running audits until the audit node has withdrawn the full amount of QSP you set here.

### Step 2: Request a security audit from Quantstamp Protocol

You can request an audit as follows:

`const requestId = await quantstamp_audit.requestAudit(uri, price, {from:requestor});`

where:
* `uri` is URI for the smart contract you wish to audit. This URI must ​not be a link to Etherscan, Etherchain, etc. It must be a web address which returns only​ plain Solidity source code, like this ​[URI example​](https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-solidity/1d2d18f9dab55b58802c3b1e70257183bb558aa2/contracts/math/SafeMath.sol). Do ​not​ enter a [​URL to a Github repo like this example​](https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/math/SafeMath.sol). We need the URI to the raw code, directly. Note that our protocol currently supports Solidity up to version 0.4.24, and that the version must be prefixed with the caret character (^) if it’s lower than 0.4.24.
* `price` is the audit price. The audit price should be no higher than the amount you granted the Quantstamp protocol permission to withdraw in Step 1. As previously, you may find it handy to use the conversion function `web3.toWei(n, "ether")` (where `n` is the amount of QSP tokens) to obtain the correct QSP amount.
* `requestId` is the Id of your request.

### Step 3: Check status of your audit and view your security report

Upon successful audit, the QSP Audit contract will emit the following event:

`LogAuditFinished(requestId, node, auditResult)`

where:

* `requestId` is a request Id, and should match the one you obtained in the previous step.
* `node` is the auditor node that processed your request.
* `auditResult` is the result of the the audit.

Once the report is ready, you can obtain it 

`const report  = await quantstamp_report_data.getReport(requestId);`

where
* `report` is the audit report submitted by an audit node.

## Run locally
### Requirements

* Node.JS v8 with npm

### Steps

1. `npm install`
1. For convenience, install Truffle globally: `npm install -g truffle@0.0.0`, replacing `0.0.0` by the Truffle version from `package.json`
1. Install Ganache (Formerly, `testrpc`), either:
    1. [UI version](http://truffleframework.com/ganache/) of version `1.1.0` or
    1. Console version: `npm install -g ganache-cli@6.1.0` and then (from another terminal tab): `ganache-cli -p 7545`
1. `truffle compile`
1. `npm test`. To also generate a code coverage report, run `npm run test-cov` instead.
1. To ensure correct commit hooks:
    1. `ln -s -f $(git rev-parse --show-toplevel)/pre-commit $(git rev-parse --show-toplevel)/.git/hooks/pre-commit`
    1. `chmod +x $(git rev-parse --show-toplevel)/.git/hooks/pre-commit`


## CI Tests

The file `buildspec-ci.yml` contains the commands to run on each push.
This includes running Truffle tests and collecting coverage report for [Coveralls](https://coveralls.io/github/quantstamp/qsp-protocol-audit-contract).



## Commands

**Note**: These commands are intenteded for the contract owner only. The description is left here as it relates to the code present in this repository. Before running a command, setup the credentials as described in the internal wiki.

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
