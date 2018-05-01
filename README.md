## qsp-protocol-audit-contract

![Build status](https://codebuild.us-east-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiZmNQeU81OEExcy8zZS9vdkpWU3NNQUJDNnVYYTRTbHQvaGE4TExaZXhVcnFFWXY3VjdJRGxyU3IrTk9UNTQzMWJJNk5rdThNZEE4SVUxS3h0QkNPZG0wPSIsIml2UGFyYW1ldGVyU3BlYyI6IkhmZUo3c005aHZRdUdjTloiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=develop)

QSP Protocol audit contract.

## Accessing deployed contracts

The addresses of the deployed contracts could be fetched from these locations that persist across deployments:

### Dev
1. Metadata (owner and address): https://s3.amazonaws.com/qsp-protocol-contract-abi-dev/QuantstampAudit.meta.json
1. ABI: https://s3.amazonaws.com/qsp-protocol-contract-abi-dev/QuantstampAudit.abi.json

### Prod
1. Metadata (owner and address): https://s3.amazonaws.com/qsp-protocol-contract-abi-prod/QuantstampAudit.meta.json
1. ABI: https://s3.amazonaws.com/qsp-protocol-contract-abi-prod/QuantstampAudit.abi.json

To make queries, go to: https://ropsten.etherscan.io/address/{address}#readContract , where `{address}` is `contractAddress` copied from the `*.meta.json` file of the corresponding stage.

## Run locally
### Requirements

* Node.JS v8 with npm

### Steps

1. `npm install`
1. For convenience, install Truffle globally: `npm install -g truffle@0.0.0`, replacing `0.0.0` by the Truffle version from `package.json`
1. Install Ganache (Formerly, `testrpc`), either:
    1. [UI version](http://truffleframework.com/ganache/) or
    1. Console version: `npm install -g ganache-cli@6.1.0` and then (from another terminal tab): `testrpc -p 7545`
1. `truffle compile`
1. `npm test`

To run tests and also generate a code coverage report, run `npm run test-cov`.

## Deploy to Ropsten (through MetaMask)
1. If you haven't, install MetaMask (https://metamask.io).
1. Start MetaMask in the browser (Chrome, Chromium, or Brave) and log in with our credentials.
1. Point MetaMask to Ropsten network.
1. Make sure MetaMask is running throughout the deployment process.
1. Place the secret mnemonic phrase and the infura API token into `credentials.js`.
1. Deploy the contracts with: `truffle migrate --network stage_dev` (Dev stage) or `truffle migrate --network stage_prod` (Prod stage).

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
