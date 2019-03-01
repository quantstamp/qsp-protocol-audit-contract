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
1. QSP Token contract address `0xc1220b0bA0760817A9E8166C114D3eb2741F5949`, ABI: http://api-ropsten.etherscan.io/api?module=contract&action=getabi&address=0xc1220b0bA0760817A9E8166C114D3eb2741F5949&format=raw

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
1. QSP Token contract address `0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d`, ABI: http://api.etherscan.io/api?module=contract&action=getabi&address=0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d&format=raw

For querying, go to: https://etherscan.io/address/{address}#readContract , where `{address}` is `contractAddress` copied from the corresponding metadata file.

## Interaction with the protocol (for audit requestor)

From our target user perspective, interaction with the protocol involves the following steps:
1) Give permission allowing Quantstamp protocol to withdraw QSP tokens from your wallet to pay for one or more audits,
2) Request an automated audit and trigger the actual payment associated with the audit, and
3) Obtain and view your audit report.

Below we describe each step in more details. We assume that you are using JS Web3 API and that the following variables are used in your code:
* `quantstamp_token` is the instantiated QSP Token contract,
* `quantstamp_audit` is the instantiated QSP Audit contract,
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
* `price` is the audit price. The audit price should be no higher than the amount you granted the Quantstamp protocol permission to withdraw in Step 1. As previously, you may find it handy to use the conversion function `web3.toWei(n, "ether")` (where `n` is the amount of QSP tokens) to obtain the correct QSP amount. Note that the price determines how quickly an audit request will be picked by some audit node.
* `requestId` is the Id of your request.

### Step 3: Check status of your audit and view your security report

Upon successful audit, the QSP Audit contract will emit the following event:

`LogAuditFinished(requestId, node, auditResult)`

where:

* `requestId` is a request Id, and should match the one you obtained in the previous step.
* `node` is the auditor node that processed your request.
* `auditResult` is the result of the the audit.

Alternatively, you can poll the QSP Audit contract to learn about the request status as follows:

`const isFinished = await quantstamp_audit.isAuditFinished(requestId);`

where:

* `requestId` is the Id of your request.
* `isFinished` is a boolean variable with value `true` when the audit is finished, and `false` otherwise.

Once the report is ready, you can obtain it as follows: 

`const report  = await quantstamp_audit.getReport(requestId);`

where:
* `report` is the audit report submitted by an audit node. The report format is currently documented in the [qsp-protocol-node](https://github.com/quantstamp/qsp-protocol-node) repository. Specifically, see the file [`report_processing.py`](https://github.com/quantstamp/qsp-protocol-node/blob/develop/qsp_protocol_node/audit/report_processing.py).

### Refunds

In cases where your request is eligible for a refund, you can request it as follows:

`const isOk  = await quantstamp_audit.refund(requestId);`

where:

* `requestId` is the Id of your request.
* `isOk` is a boolean status of your refund. `true` indicates that it was processes correctly, `false` otherwise.

## Interaction with the protocol (for audit node)

From audit node perspective, interaction with the protocol involves the following steps:
1) Give permission allowing Quantstamp protocol to withdraw QSP tokens from your wallet to enable staking,
2) Stake a given deposit,
3) Set your minimum audit price,
4) Wait for any incoming audit requests,
5) Submit a request to perform an audit,
6) Perform an audit and submit the report,
7) Wait for the police to accept your report, and
8) Claim your reward.

Below we describe each step in more details. We assume that you are using JS Web3 API and that the following variables are used in your code:
* `quantstamp_token` is the instantiated QSP Token contract,
* `quantstamp_audit` is the instantiated QSP Audit contract,
* `auditor` is your address that holds the QSP tokens that you will stake. You need some ETH to pay for the gas fees, like with any other transaction on Ethereum.

Note that the address and ABI for each contract depends on whether you are on Ropsten or Mainnet. You can find the relevant information in one of the previous sections.

Let us briefly discuss staking before elaborating each step. Staking a deposit is a mechanism that incentivizes audit nodes to perform correct computations . Each node must stake at least the amount returned by `await quantstamp_audit.getMinAuditStake()`. If an audit node submits an incorrect report, part of the stake deposit (defined by `slashPercentage` in the contract `QuantstampAuditPolice`) will be lost by the audit node. The more you stake, the more mistakes you are allowed to make before getting denied any audit. If you provide only correct reports, your stake deposit is never lost and you can get it back.

### Step 1: Authorize Quantstamp Protocol to collect your QSP as a stake deposit

You can authorize Quantstamp Protocol to collect your QSP as payment as follows:

`await quantstamp_token.approve(quantstamp_audit.address, _value, {from : auditor});`

where:
* `_value` is the total amount of QSP which you are giving permission to withdraw. Please note that this amount needs to be multiplied by 10^18 (similarly to how ETH gets converted into Wei). One way of doing the conversion is via `web3.toWei(n, "ether")`, where `n` is the amount of QSP tokens.

### Step 2: Stake the given deposit.

You can stake a given, previously approved, amount as follows:

`await quantstamp_audit.stake(amount, {from: auditor});`

where
* `amount` is the amount of QSP you want to stake. Please note that this amount needs to be multiplied by 10^18 (similarly to how ETH gets converted into Wei). One way of doing the conversion is via `web3.toWei(n, "ether")`, where `n` is the amount of QSP tokens.

You can get back the total stake deposit as follows: 

`await quantstamp_audit.unstake({from: auditor});`

### Step 3: Set your minimum audit price.

Each audit node operator may choose their own minimum acceptable prices per audit as follows:

`await quantstamp_audit.setAuditNodePrice(price, {from: auditor});`

where
* `price` is the minimum amount of QSP you want to charge per audit. Please note that this amount needs to be multiplied by 10^18 (similarly to how ETH gets converted into Wei). One way of doing the conversion is via `web3.toWei(n, "ether")`, where `n` is the amount of QSP tokens.

### Step 4: Wait for any incoming audit requests.

Upon an audit request, the QSP Audit contract will emit the following event:

`LogAuditRequested(requestId, requestor, uri, price)`

where:

* `requestId` is an audit request Id.
* `requestor` is the address that requested the audit.
* `uri` uri of the contract to audit.
* `price` audit price as provided by the requestor.

Alternatively, you can poll the QSP Audit contract to learn about whether there are any audit requests that could be picked up by your node:

`const availabilityState = await quantstamp_audit.anyRequestAvailable();`

where:

* `availabilityState` is an enumeration and takes one of the values:
  * `Error` - unexpected error,
  * `Ready` - an audit is available to be picked up,
  * `Empty` - there is no audit request in the queue,
  * `Exceeded` - number of incomplete audit requests assigned to your node has reached the cap,
  * `Underpriced` - all queued audit requests are less than the expected price,
  * `Understaked` - the audit node's stake is not large enough to get an audit.
  
### Step 5: Submit a request to perform an audit.
  
Although it cannot be guaranteed that you will get an audit, you can submit a request to perform the audit as follows:

`await quantstamp_audit.getNextAuditRequest();`

The function finds the most expensive audit and tries to assign it to your node. Upon successful completion: 1) it will lock your deposit for a number of blocks that is a sum of the timeout for the audit node to submit a report and the timeout for the police node to check your report (you will not be able to unstake the funds till then or till the police checks your report), and 2) the function will emit the event:

`LogAuditAssigned(requestId, auditor, requestor, uri, price, requestBlockNumber)`

where:

* `requestId` is an audit request Id.
* `auditor` is a wallet address of the audit node that got the request.
* `requestor` is the address that requested the audit.
* `uri` uri of the contract to audit.
* `price` audit price as provided by the requestor.
* `requestBlockNumber` Ethereum block number at which the audit was requested.

Upon failure, the function `getNextAuditRequest()` will emit one of the events:

* `LogAuditAssignmentUpdate_Expired()` - the timeout for assigning the request has expired, 
* `LogAuditQueueIsEmpty()` - there are no audit requests to assign,
* `LogAuditAssignmentError_ExceededMaxAssignedRequests()` - your node has assigned too many requests that need to be finished before requesting a new audit,
* `LogAuditAssignmentError_Understaked()` - your stake deposit is too low,
* `LogAuditNodePriceHigherThanRequests()` - your minimum price is too high for any of the audit requests. 
  
Note that regardless of whether the call succeeds or not, you'll need to pay the gas.

If instead of waiting for the event `LogAuditAssigned()` you prefer polling, you can use the following function

`await quantstamp_audit.myMostRecentAssignedAudit();`

which returns the same data as `LogAuditAssigned()` but skips the field `auditor`.
  
### Step 6: Perform an audit and submit the report.

If you previous step succeeded and you performed an audit, you can submit the report as follows:

`await quantstamp_audit.submitReport(requestId, auditResult, report);`

where:

* `requestId` is an audit request Id.
* `auditResult` is an enumeration that describes the status of the audit and should take one of the two values: 1) `Completed` - automated audit finished successfully and the report is available, or 2) `Error` - automated audit failed to finish; the report contains detailed information about the error.
* `report` - audit report that must follow the predefined format.

Upon failure, the function will emit one of the events:

* `LogReportSubmissionError_InvalidResult` - when `auditResult` has an incorrect value,
* `LogReportSubmissionError_InvalidState` - when the audit request is not ready yet to receive the report,
* `LogReportSubmissionError_InvalidAuditor` - when you try to submit a report for audit that was not assigned to you,
* `LogReportSubmissionError_ExpiredAudit` - when you try to submit a report after the audit request expired.

### Step 7: Wait for the police to accept your report.

Police nodes have a certain time to check your report. Otherwise a timeout occurs and you can claim the reward regardless of whether the report is correct or not. Regardless of whether the police checks your report before the timeout or not, you need to wait the given number of blocks before claiming the reward.

You can get the timeout value as follows: 
 
`const timeout = await quantstamp_audit.getPolice().getPoliceTimeoutInBlocks();`
 
where:

* `timeout` is the timeout value expressed as the number of blocks.

If you prefer to poll the police contract to check if you can claim the reward, you can do it as follows:

`const canClaim = await quantstamp_audit.getPolice().canClaimAuditReward(auditNode, requestId);`

where:

* `auditNode` is your node's wallet address,
* `requestId` is the request Id you audited,
* `canClaim` is a boolean value indicating whether you can claim a reward.

When the police checks your report, they will emit the event:

`PoliceReportSubmitted(policeNode, requestId, state)`

where:
* `policeNode` is the wallet address of the police node that checked your report,
* `requestId` is the request Id,
* `state` is an enumeration with either of the values: `VALID` (when your report was accepted as valid) or `INVALID` (when your report was marked as invalid). In the latter case, the police will also slash a part of your deposit and will emit the following event: 

`PoliceSlash(requestId, policeNode, auditNode, slashAmount)`

where:

* `requestId` is the audit request Id,
* `policeNode` is the police node which checked your report,
* `auditNode` is your address,
* `slashAmount` is the deposit amount that got slashed. 

### Step 8: Claim your reward.

You can check if there are any rewards available to you as follows:

`const hasRewards = await quantstamp_audit.hasAvailableRewards();`

where:

* `hasRewards` is a boolean value indicating whether you have any rewards.

You can then claim the reward as follows:

`await quantstamp_audit.claimReward(requestId, {from: auditor});`

where:

* `requestId` is the audit request Id for which you want to claim a reward.

If there are multiple rewards, you can collect all of them as follows:

`await quantstamp_audit.claimRewards({from: auditor});`
  
## Interaction with the protocol (for police node)

Police nodes are trusted entities that verify if the reports submitted by audit nodes are correct. Any police node payments are handled automatically by the protocol.

From police node perspective, interaction with the protocol involves the following steps:
1) Get whitelisted by the protocol owner,
2) Wait for any incoming audit reports, and
3) Submit police report.

Below we describe each step in more details. We assume that you are using JS Web3 API and that the following variables are used in your code:
* `quantstamp_audit` is the instantiated QSP Audit contract,
* `police` is your wallet address where you will receive rewards. You need some ETH to pay for the gas fees, like with any other transaction on Ethereum.

Note that the address and ABI for each contract depends on whether you are on Ropsten or Mainnet. You can find the relevant information in one of the previous sections.

### Step 1: Get whitelisted by the protocol owner.

You need to contact the protocol owner (e.g., by email) and ask them to whitelist your address so that you can play the role of the police. 

### Step 2: Wait for any incoming audit reports and get paid.

Upon report submission by the audit node, the following event gets emitted:

`PoliceNodeAssignedToReport(policeNode, requestId)`

where:

* `policeNode` is the police node chosen to check the report, 
* `requestId` is the audit request Id.

### Step 3: Submit police report.

If your node was chosen, check the report, and submit your result as follows:

`await quantstamp_audit.submitPoliceReport(requestId, report, isVerified, {from : police});`

where:
* `requestId` is the checked request Id, 
* `report` is the police report that follows an established format,
* `isVerified` is a boolean value indicating whether the police report matches the report submitted by the audit node. If the reports do not match, part of the audit node's deposit gets slashed and is distributed to the police nodes.

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

1. `npm run command -- -n=dev -a=whitelist-police-node --p 0x123456789` whitelists a node defined by a given address
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

## Deploy to other networks
1. Specify the network names( as defined in truffle.js ) and the version that you want to deploy in deploy.yml
1. Run `npm run deploy`
1. If successful, you should now have a `deployer-<network-name>.sh` file
for each network.
1. Execute the files 

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
