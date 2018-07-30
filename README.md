## qsp-protocol-audit-contract

![Build status](https://codebuild.us-east-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiZmNQeU81OEExcy8zZS9vdkpWU3NNQUJDNnVYYTRTbHQvaGE4TExaZXhVcnFFWXY3VjdJRGxyU3IrTk9UNTQzMWJJNk5rdThNZEE4SVUxS3h0QkNPZG0wPSIsIml2UGFyYW1ldGVyU3BlYyI6IkhmZUo3c005aHZRdUdjTloiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=develop)
[![Coverage Status](https://coveralls.io/repos/github/quantstamp/qsp-protocol-audit-contract/badge.svg?branch=develop&t=kDg4aW)](https://coveralls.io/github/quantstamp/qsp-protocol-audit-contract)

QSP Protocol audit contract.

## Access deployed contracts

The addresses of the deployed contracts could be fetched from these locations that persist across deployments:

### Dev (Ropsten)

1. Audit contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract-abi-dev/QuantstampAudit.meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract-abi-dev/QuantstampAudit.abi.json
1. Audit Data contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract-abi-dev/QuantstampAuditData.meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract-abi-dev/QuantstampAuditData.abi.json
1. Audit View contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract-abi-dev/QuantstampAuditView.meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract-abi-dev/QuantstampAuditView.abi.json

For querying, go to: https://ropsten.etherscan.io/address/{address}#readContract , where `{address}` is `contractAddress` copied from the corresponding metadata file.

### Prod (Main Net)
1. Audit contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract-abi-prod/QuantstampAudit.meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract-abi-prod/QuantstampAudit.abi.json
1. Audit Data contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract-abi-prod/QuantstampAuditData.meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract-abi-prod/QuantstampAuditData.abi.json
1. Audit View contract:
    - Metadata (owner and contract address): https://s3.amazonaws.com/qsp-protocol-contract-abi-prod/QuantstampAuditView.meta.json
    - ABI: https://s3.amazonaws.com/qsp-protocol-contract-abi-prod/QuantstampAuditView.abi.json

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
1. If you deploy to Dev or Prod stages of the QSP Protocol, make sure you have AWS credentials that allow write access to the bucket `qsp-protocol-contract-abi-<stage>`. If deployment is successful, the new contract address and the owner address will be written to the corresponding S3 file automatically.
1. Go to `truffle.js` and under `deploy`, set values to `true` for the contracts you would like to deploy.
1. Deploy the contract(s) to the desired stage:
    * `truffle migrate --network stage_dev` - QSP protocol dev stage.
    * `truffle migrate --network stage_prod` - QSP protocol prod stage.
    * `truffle migrate --network ropsten` - Ropsten for independent testing (does not write anything to S3).
1. Whitelist the Audit contract in the Data contract:
    * `npm run command-dev -- -a=whitelist-audit-contract` - for the dev stage.
    * `npm run command-prod -- -a=whitelist-audit-contract` - for the prod stage.

    Note: a successful return of the whitelisting script does not necessarily mean the transaction is fully completed. Please check
    the status manually on a block explorer and wait for the desired number of confirmations.
1. To perform actions on a deployed smart contract, use the following commands:
    * `npm run command-dev -- -p=<parameter>` - QSP protocol dev stage.
    * `npm run command-prod -- -p=<parameter>` - QSP protocol prod stage.
    
    For the full list, check out the next section and `./scripts/definitions.json`. The list is extensible.

## Commands

**Note**: before running a command, setup the credentials as described in the section above.

1. `npm run command-dev -- -a=whitelist -p=0x123456789` whitelists a node defined by a given address
1. `npm run command-dev -- -a=set-max-assigned -p=100` sets "maximum assigned nodes"
1. `npm run command-dev -- -a=get-next-audit-request` calls `getNextAuditRequest()` on the contract. May be useful for cleaning up the audit waiting queue.

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
