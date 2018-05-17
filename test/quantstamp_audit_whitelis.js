const Util = require("./util.js");
const AuditState = Util.AuditState;
const assertEvent = Util.assertEvent;
const assertEventAtIndex = Util.assertEventAtIndex;
const extractRequestId = Util.extractRequestId;

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
    assertEvent({
        result: await quantstamp_audit.addAddressToWhitelist(auditor),
        name: "WhitelistedAddressAdded",
        args: (args) => {
        assert.equal(args.addr, auditor);
        }
    });

    assert.equal(auditor, web3.toHex((await quantstamp_audit.HeadWhitelist.call())));

    // empty the white list for the next test case
    assertEvent({
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

    assert.equal(0, web3.toHex((await quantstamp_audit.HeadWhitelist.call())));
  });

  it ("should not change the head after removing from an empty list", async function () {
    const auditor = accounts[1];
    await quantstamp_audit.removeAddressFromWhitelist(auditor);

    assert.equal(0, web3.toHex((await quantstamp_audit.HeadWhitelist.call())));
  });

  it ("should return next as null for empty list", async function () {
    assert.equal(0,
      web3.toHex((await quantstamp_audit.getNextWhitelistedAddress.call(await quantstamp_audit.HeadWhitelist.call()))));
  });

  it ("should change the head after removing the first whitelisted address", async function () {
    const auditor = accounts[1];
    const auditor2 = accounts[2];
    await quantstamp_audit.addAddressToWhitelist(auditor);
    await quantstamp_audit.addAddressToWhitelist(auditor2);
    await quantstamp_audit.removeAddressFromWhitelist(auditor);

    assert.equal(auditor2, web3.toHex((await quantstamp_audit.HeadWhitelist.call())));

    // remove the rest
    await quantstamp_audit.removeAddressFromWhitelist(auditor2);
  });

  it ("should not change the head provided it is not removed", async function () {
    const auditor = accounts[1];
    const auditor2 = accounts[2];
    await quantstamp_audit.addAddressToWhitelist(auditor);
    await quantstamp_audit.addAddressToWhitelist(auditor2);
    await quantstamp_audit.removeAddressFromWhitelist(auditor2);

    assert.equal(auditor, web3.toHex((await quantstamp_audit.HeadWhitelist.call())));

    // remove the rest
    await quantstamp_audit.removeAddressFromWhitelist(auditor);
  });

  it ("should not let anyone other than the owner modify whitelist", async function () {
    const fakeOwner = accounts[1];
    const auditor = accounts[2];

    Util.assertTxFail(quantstamp_audit.addAddressToWhitelist(auditor, {from: fakeOwner}));
    Util.assertTxFail(quantstamp_audit.removeAddressFromWhitelist(auditor, {from: fakeOwner}));
  });

  it ("should provide access to all whitelisted addresses from head", async function () {
    const auditor = accounts[1];
    const auditor2 = accounts[2];
    await quantstamp_audit.addAddressToWhitelist(auditor);
    await quantstamp_audit.addAddressToWhitelist(auditor2);

    assert.equal(auditor, web3.toHex(web3.toHex((await quantstamp_audit.HeadWhitelist.call()))));
    assert.equal(auditor2,
      web3.toHex((
        await quantstamp_audit.getNextWhitelistedAddress.call(
          web3.toHex((await quantstamp_audit.HeadWhitelist.call())))
      )));

    // remove all auditors from the whitelist
    await quantstamp_audit.removeAddressFromWhitelist(auditor);
    await quantstamp_audit.removeAddressFromWhitelist(auditor2);
  });

});
