const Util = require("./util.js");
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');
const abiDecoder = require('abi-decoder');


contract('QuantstampAudit_stakedList', function(accounts) {

  let quantstamp_audit_data;
  let quantstamp_audit;
  let quantstamp_token;
  let quantstamp_audit_token_escrow;
  let quantstamp_audit_police;

  const owner = accounts[0];

  let minAuditStake;
  let auditor = accounts[3];

  beforeEach(async function () {
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_token_escrow = await QuantstampAuditTokenEscrow.deployed();
    quantstamp_audit_police = await QuantstampAuditPolice.deployed();

    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_police.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_token_escrow.addAddressToWhitelist(quantstamp_audit.address);

    // used to decode events in QuantstampAuditPolice
    abiDecoder.addABI(quantstamp_audit_police.abi);

    // used to decode events in QuantstampAuditTokenEscrow
    abiDecoder.addABI(quantstamp_audit_token_escrow.abi);

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});

    minAuditStake = await quantstamp_audit_token_escrow.minAuditStake();
    // transfer min_stake QSP tokens to the auditor
    await quantstamp_token.transfer(auditor, minAuditStake, {from : owner});
    // approve the audit contract to use up to min_stake for staking
    await quantstamp_token.approve(quantstamp_audit.address, minAuditStake, {from : auditor});
  });

  it ("should stake an address and be accessible from the head", async function () {
    Util.assertNestedEventAtIndex({
      result: await quantstamp_audit.stake(minAuditStake, {from: auditor}),
      name: "StakedNodeAdded",
      args: (args) => {
      assert.equal(args.addr, auditor);
      },
      index: 4
    });
    // empty the white list for the next test case
    Util.assertNestedEventAtIndex({
      result: await quantstamp_audit.unstake({from: auditor}),
      name: "StakedNodeRemoved",
      args: (args) => {
      assert.equal(args.addr, auditor);
      },
      index: 2
    });
  });

  it ("should empty the staked list after equally adding and removing addresses", async function () {
    await quantstamp_audit.stake(minAuditStake, {from: auditor});
    await quantstamp_audit.unstake({from: auditor});

    assert.equal(0, web3.toHex((await quantstamp_audit_token_escrow.getNextStakedNode.call(0))));
  });

  it ("should provide access to all staked addresses from head", async function () {
    const auditors = [accounts[3], accounts[4]];

    for (var i in auditors) {
      // transfer min_stake QSP tokens to the auditor
      await quantstamp_token.transfer(auditors[i], minAuditStake, {from : owner});
      // approve the audit contract to use up to min_stake for staking
      await quantstamp_token.approve(quantstamp_audit.address, minAuditStake, {from : auditors[i]});
      await quantstamp_audit.stake(minAuditStake, {from: auditors[i]});
    }

    for (var current = 0, i = 0;
         await quantstamp_audit_token_escrow.getNextStakedNode.call(current) != 0;
         current = await quantstamp_audit_token_escrow.getNextStakedNode.call(current), ++i) {
      assert.equal(auditors[i], web3.toHex(await quantstamp_audit_token_escrow.getNextStakedNode.call(current)));
    }
  });
});
