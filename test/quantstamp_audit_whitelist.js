const Util = require("./util.js");
const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampToken = artifacts.require('QuantstampToken');


contract('QuantstampAudit_whitelist', function(accounts) {

  let quantstamp_audit;
  let quantstamp_token;

  beforeEach(async function () {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_token = await QuantstampToken.deployed();
  });

  it ("should add an address to the whitelist and be accessible from the head", async function () {
    const auditor = accounts[1];
    Util.assertEvent({
        result: await quantstamp_audit.addAddressToWhitelist(auditor),
        name: "WhitelistedAddressAdded",
        args: (args) => {
        assert.equal(args.addr, auditor);
        }
    });

    // empty the white list for the next test case
    Util.assertEvent({
        result: await quantstamp_audit.removeAddressFromWhitelist(auditor),
        name: "WhitelistedAddressRemoved",
        args: (args) => {
        assert.equal(args.addr, auditor);
        }
    });
  });

  it ("should empty the whitelist after equally adding and removing addresses", async function () {
    const auditor = accounts[1];
    await quantstamp_audit.addAddressToWhitelist(auditor);
    await quantstamp_audit.removeAddressFromWhitelist(auditor);

    assert.equal(0, web3.toHex((await quantstamp_audit.getNextWhitelistedAddress.call(0))));
  });

  it ("should not let anyone other than the owner modify whitelist", async function () {
    const fakeOwner = accounts[1];
    const auditor = accounts[2];

    Util.assertTxFail(quantstamp_audit.addAddressToWhitelist(auditor, {from: fakeOwner}));
    Util.assertTxFail(quantstamp_audit.removeAddressFromWhitelist(auditor, {from: fakeOwner}));
  });

  it ("should provide access to all whitelisted addresses from head", async function () {
    const auditors = [accounts[1], accounts[2]];

    for (var i in auditors) {
      await quantstamp_audit.addAddressToWhitelist(auditors[i]);
    }

    for (var current = 0, i = 0;
         await quantstamp_audit.getNextWhitelistedAddress.call(current) != 0;
         current = await quantstamp_audit.getNextWhitelistedAddress.call(current), ++i) {
      assert.equal(auditors[i], web3.toHex(await quantstamp_audit.getNextWhitelistedAddress.call(current)));
    }

    // remove all auditors from the whitelist
    for (var i in auditors) {
      await quantstamp_audit.removeAddressFromWhitelist(auditors[i]);
    }
  });

});
