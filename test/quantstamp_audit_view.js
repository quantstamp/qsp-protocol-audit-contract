const Util = require("./util.js");

const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');


contract('QuantstampAuditView_stats', function(accounts) {
  const owner = accounts[0];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const requestorBudget = Util.toQsp(100000);
  const uri = "http://www.quantstamp.com/contract1.sol";

  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_view;
  let quantstamp_token;

  // Helper function to empty the queue
  async function emptyQueue (n) {
    // remove requests
    await quantstamp_audit.addAddressToWhitelist(auditor);
    await quantstamp_audit.setAuditNodePrice(0, {from: auditor});
    for (let i = 0; i < n; i++){
      await quantstamp_audit.getNextAuditRequest({from: auditor});
    }
    await quantstamp_audit.removeAddressFromWhitelist(auditor);
  }

  beforeEach(async function () {
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(1000), {from : requestor});

    // allow audit nodes to perform many audits at once
    await quantstamp_audit_data.setMaxAssignedRequests(1000);
  });

  it("let owner to QuantstampAudit address", async function () {
    const audit = await quantstamp_audit_view.audit.call();
    // change QuantstampAudit to something else
    await quantstamp_audit_view.setQuantstampAudit(auditor);
    assert.equal(await quantstamp_audit_view.audit.call(), auditor);
    // change it back
    await quantstamp_audit_view.setQuantstampAudit(audit);
    assert.equal(await quantstamp_audit_view.audit.call(), audit);
    // only owner can change
    Util.assertTxFail(quantstamp_audit_view.setQuantstampAudit(audit, {from : requestor}));
    // address should be valid
    Util.assertTxFail(quantstamp_audit_view.setQuantstampAudit(0, {from : requestor}));
  });

  it("let owner to QuantstampAuditData address", async function () {
    const auditData = await quantstamp_audit_view.auditData.call();
    // change QuantstampAuditdata to something else
    await quantstamp_audit_view.setQuantstampAuditData(auditor);
    assert.equal(await quantstamp_audit_view.auditData.call(), auditor);
    // change the address back
    await quantstamp_audit_view.setQuantstampAuditData(auditData);
    assert.equal(await quantstamp_audit_view.auditData.call(), auditData);
    // only owner can change
    Util.assertTxFail(quantstamp_audit_view.setQuantstampAuditData(auditData, {from : requestor}));
    // address should be valid
    Util.assertTxFail(quantstamp_audit_view.setQuantstampAuditData(0, {from : requestor}));
  });

  it("returns zero for non-advertised minPrice", async function () {
    assert.equal(await quantstamp_audit_view.getMinAuditPriceSum(), 0);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceCount(), 0);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMin(), 0);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMax(), 0);
  });


  it("returns proper stat for advertised minPrice", async function () {
    const prices = [8, 5, 6];
    // adding accounts to the whitelist
    const auditors = [auditor, accounts[4], accounts[5]];
    for (i in auditors) {
      // whitelisting auditor
      await quantstamp_audit.addAddressToWhitelist(auditors[i]);
      // advertise min price
      await quantstamp_audit.setAuditNodePrice(prices[i], {from: auditors[i]});
    }

    assert.equal(await quantstamp_audit_view.getMinAuditPriceSum(), prices.reduce((a, b) => a + b, 0));
    assert.equal(await quantstamp_audit_view.getMinAuditPriceCount(), prices.length);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMin(), Math.min(...prices));
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMax(), Math.max(...prices));

    // remove two auditors from the whitelist
    for (i in auditors) {
      await quantstamp_audit.removeAddressFromWhitelist(auditors[i]);
    }
  });

  it("counts queue size properly", async function () {
    assert.equal(await quantstamp_audit_view.getQueueLength(), 0);
    let prices = [1, 2];

    await quantstamp_audit.requestAudit(uri, prices[0], {from:requestor});
    await quantstamp_audit.requestAudit(uri, prices[0], {from:requestor});
    await quantstamp_audit.requestAudit(uri, prices[1], {from:requestor});
    assert.equal(await quantstamp_audit_view.getQueueLength(), 3);

    // Empty the queue for the next test cases
    await emptyQueue(3);
    assert.equal(await quantstamp_audit_view.getQueueLength(), 0);
  });

  it("considers zero price audit", async function () {
    assert.equal(await quantstamp_audit_view.getQueueLength(), 0);
    let price = 0;
    await quantstamp_audit.requestAudit(uri, price, {from:requestor});
    assert.equal(await quantstamp_audit_view.getQueueLength(), 1);

    await emptyQueue(1);
    assert.equal(await quantstamp_audit_view.getQueueLength(), 1 /*Expected result 0*/);
  });

});
