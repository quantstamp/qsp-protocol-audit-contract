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

  it ("should let an audit node address to be whitelisted and accessible from head", async function () {
    const auditor = accounts[1];
    await quantstamp_audit.addAddressToWhitelist(auditor);

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

  it ("should empty the white list after equal add and remove", async function () {
    const auditor = accounts[1];
    await quantstamp_audit.addAddressToWhitelist(auditor);
    await quantstamp_audit.removeAddressFromWhitelist(auditor);

    assert.equal(0, web3.toHex((await quantstamp_audit.HeadWhitelist.call())));
  });

  it ("should not change the head after a remove on an empty list", async function () {
    const auditor = accounts[1];
    await quantstamp_audit.removeAddressFromWhitelist(auditor);

    assert.equal(0, web3.toHex((await quantstamp_audit.HeadWhitelist.call())));
  });

  it ("should return null next for empty list", async function () {
    assert.equal(0,
      web3.toHex((await quantstamp_audit.getNextWhitelistedAddress.call(await quantstamp_audit.HeadWhitelist.call()))));
  });

  it ("should change the head after the first whitelisted node is removed", async function () {
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

  // no body other than owner can add/revmoe from whitelisted auditnodes
  it ("should let anyone other that owner add/remove whitelist", async function () {
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

    // remove all
    await quantstamp_audit.removeAddressFromWhitelist(auditor);
    await quantstamp_audit.removeAddressFromWhitelist(auditor2);
  });

});
