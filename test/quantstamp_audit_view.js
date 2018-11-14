const Util = require("./util.js");
const BN = require('web3').utils.BN;

const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');


contract('QuantstampAuditView', function(accounts) {
  const owner = accounts[0];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const requestorBudget = Util.toQsp(100000);
  const uri = "http://www.quantstamp.com/contract1.sol";

  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_multirequest_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_view;
  let quantstamp_token;
  let quantstamp_audit_police;

  // Helper function to empty the queue
  async function emptyQueue (n) {
    // remove requests
    await quantstamp_audit_data.addNodeToWhitelist(auditor);
    await quantstamp_audit.setAuditNodePrice(0, {from: auditor});
    for (let i = 0; i < n; i++){
      await quantstamp_audit.getNextAuditRequest({from: auditor});
    }
    await quantstamp_audit_data.removeNodeFromWhitelist(auditor);
  }

  beforeEach(async function () {
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_multirequest_data = await QuantstampAuditMultiRequestData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    quantstamp_audit_police = await QuantstampAuditPolice.deployed();

    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_multirequest_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_report_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_police.addAddressToWhitelist(quantstamp_audit.address);

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(1000), {from : requestor});
    // timeout requests
    await quantstamp_audit_data.setAuditTimeout(10000);
    // allow audit nodes to perform many audits at once
    await quantstamp_audit_data.setMaxAssignedRequests(1000);
  });

  it("lets the owner change the QuantstampAudit address", async function () {
    const audit = await quantstamp_audit_view.audit.call();
    const another_quantstamp_audit_data = (await QuantstampAuditData.new(quantstamp_token.contract.address)).contract.address;
    const another_quantstamp_audit_multirequest_data = (await QuantstampAuditMultiRequestData.new()).contract.address;
    const another_quantstamp_audit_report_data = (await QuantstampAuditReportData.new()).contract.address;
    const another_quantstamp_audit_police = (await QuantstampAuditPolice.new()).contract.address;
    const another_quantstamp_audit = (await QuantstampAudit.new(another_quantstamp_audit_data,
                                                                another_quantstamp_audit_multirequest_data,
                                                                another_quantstamp_audit_report_data,
                                                                another_quantstamp_audit_police)).contract.address;

    // change QuantstampAudit to something else
    await quantstamp_audit_view.setQuantstampAudit(another_quantstamp_audit);
    assert.equal(await quantstamp_audit_view.audit.call(), another_quantstamp_audit);
    assert.equal(await quantstamp_audit_view.auditData.call(), another_quantstamp_audit_data);

    // only owner can change
    Util.assertTxFail(quantstamp_audit_view.setQuantstampAudit(audit, {from : requestor}));
    // address should be valid
    Util.assertTxFail(quantstamp_audit_view.setQuantstampAudit(0, {from : requestor}));

    // change it back
    await quantstamp_audit_view.setQuantstampAudit(audit);
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
      await quantstamp_audit_data.addNodeToWhitelist(auditors[i]);
      // advertise min price
      await quantstamp_audit.setAuditNodePrice(prices[i], {from: auditors[i]});
    }

    assert.equal(await quantstamp_audit_view.getMinAuditPriceSum(), prices.reduce((a, b) => a + b, 0));
    assert.equal(await quantstamp_audit_view.getMinAuditPriceCount(), prices.length);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMin(), Math.min(...prices));
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMax(), Math.max(...prices));

    // remove two auditors from the whitelist
    for (i in auditors) {
      await quantstamp_audit_data.removeNodeFromWhitelist(auditors[i]);
    }
  });

  it("should exclude prices with max integer", async function () {
    let maxUint256 = new BN(0).notn(256).toString();
    const prices = [maxUint256, 1, maxUint256];
    // adding accounts to the whitelist
    const auditors = [auditor, accounts[4], accounts[5]];
    for (i in auditors) {
      // whitelisting auditor
      await quantstamp_audit_data.addNodeToWhitelist(auditors[i]);
      // advertise min price
      await quantstamp_audit.setAuditNodePrice(prices[i], {from: auditors[i]});
    }

    assert.equal(await quantstamp_audit_view.getMinAuditPriceSum(), 1);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceCount(), 1);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMin(), 1);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMax(), 1);

    // remove two auditors from the whitelist
    for (i in auditors) {
      await quantstamp_audit_data.removeNodeFromWhitelist(auditors[i]);
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

  it("Should not consider zero price audit", async function () {
    assert.equal(await quantstamp_audit_view.getQueueLength(), 0);
    let price = 0;
    Util.assertTxFail(quantstamp_audit.requestAudit(uri, price, {from:requestor}));
    assert.equal(await quantstamp_audit_view.getQueueLength(), 0);
  });

  it("should return proper hash for an on-chain report", async function () {
    assert.equal(await quantstamp_audit_view.getQueueLength(), 0);

    const notRequestedRequestId = 11111;
    const price = 123;
    const report = 0xab;
    const hashOfNonExistedReport = await quantstamp_audit_view.getReportHash(notRequestedRequestId);

    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    await quantstamp_audit_data.addNodeToWhitelist(auditor);
    const requestId = Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from: auditor}));
    await quantstamp_audit.submitReport(requestId, Util.AuditState.Completed, report, {from: auditor});
    await quantstamp_audit_data.removeNodeFromWhitelist(auditor);

    const hashOfReport = await quantstamp_audit_view.getReportHash(requestId);

    assert.notEqual(hashOfNonExistedReport, hashOfReport);
  });

});
