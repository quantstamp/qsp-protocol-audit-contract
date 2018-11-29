const Util = require("./util.js");
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampToken = artifacts.require('QuantstampToken');


contract('QuantstampAudit_whitelist', function(accounts) {

  let quantstamp_audit_data;
  let quantstamp_audit;
  let quantstamp_token;

  beforeEach(async function () {
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_token = await QuantstampToken.deployed();
  });

  it ("should add an address to the whitelist and be accessible from the head", async function () {
    const auditor = accounts[1];
    Util.assertEvent({
        result: await quantstamp_audit_data.addNodeToWhitelist(auditor),
        name: "WhitelistedNodeAdded",
        args: (args) => {
        assert.equal(args.addr, auditor);
        }
    });

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
    const auditor = accounts[1];
    await quantstamp_audit_data.addNodeToWhitelist(auditor);
    await quantstamp_audit_data.removeNodeFromWhitelist(auditor);

    assert.equal(0, web3.utils.toHex((await quantstamp_audit_data.getNextWhitelistedNode.call(Util.zeroAddress))));
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

    for (var current = Util.zeroAddress, i = 0;
         await quantstamp_audit_data.getNextWhitelistedNode.call(current) != Util.zeroAddress;
         current = await quantstamp_audit_data.getNextWhitelistedNode.call(current), ++i) {
      assert.equal(auditors[i].toLowerCase(), web3.utils.toHex(await quantstamp_audit_data.getNextWhitelistedNode.call(current)));
    }

    // remove all auditors from the whitelist
    for (var i in auditors) {
      await quantstamp_audit_data.removeNodeFromWhitelist(auditors[i]);
    }
  });

});
