const Util = require("./util.js");
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');


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

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});

    minAuditStake = await quantstamp_audit_token_escrow.minAuditStake();
    // transfer min_stake QSP tokens to the auditor
    await quantstamp_token.transfer(auditor, minAuditStake, {from : owner});
    // approve the audit contract to use up to min_stake for staking
    await quantstamp_token.approve(quantstamp_audit.address, minAuditStake, {from : auditor});
  });

  it ("should stake an address and be accessible from the head", async function () {
        console.log("B");
    const res= await quantstamp_audit.stake(minAuditStake, {from: auditor});
    console.log(res);
    Util.assertEvent({
        result: await quantstamp_audit.stake(minAuditStake, {from: auditor}),
        name: "WhitelistedNodeAdded",
        args: (args) => {
        assert.equal(args.addr, auditor);
        }
    });
    console.log("B");
    // empty the white list for the next test case
    Util.assertEvent({
        result: await quantstamp_audit_data.removeNodeFromWhitelist(auditor),
        name: "WhitelistedNodeRemoved",
        args: (args) => {
        assert.equal(args.addr, auditor);
        }
    });
  });

  it ("should empty the whitelist after equally adding and removing addresses", async function () {
    await quantstamp_audit_data.addNodeToWhitelist(auditor);
    await quantstamp_audit_data.removeNodeFromWhitelist(auditor);

    assert.equal(0, web3.toHex((await quantstamp_audit_data.getNextWhitelistedNode.call(0))));
  });

  it ("should not let anyone other than the owner modify whitelist", async function () {
    const fakeOwner = accounts[1];
    const auditor = accounts[2];

    Util.assertTxFail(quantstamp_audit_data.addNodeToWhitelist(auditor, {from: fakeOwner}));
    Util.assertTxFail(quantstamp_audit_data.removeNodeFromWhitelist(auditor, {from: fakeOwner}));
  });

  it ("should provide access to all whitelisted addresses from head", async function () {
    const auditors = [accounts[1], accounts[2]];

    for (var i in auditors) {
      await quantstamp_audit_data.addNodeToWhitelist(auditors[i]);
    }

    for (var current = 0, i = 0;
         await quantstamp_audit_data.getNextWhitelistedNode.call(current) != 0;
         current = await quantstamp_audit_data.getNextWhitelistedNode.call(current), ++i) {
      assert.equal(auditors[i], web3.toHex(await quantstamp_audit_data.getNextWhitelistedNode.call(current)));
    }

    // remove all auditors from the whitelist
    for (var i in auditors) {
      await quantstamp_audit_data.removeNodeFromWhitelist(auditors[i]);
    }
  });

});
