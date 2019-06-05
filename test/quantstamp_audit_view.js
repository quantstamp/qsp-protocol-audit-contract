const Util = require("./util.js");
const BN = require('bn.js');

const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');


contract('QuantstampAuditView', function(accounts) {
  const owner = accounts[0];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const requestorBudget = Util.toQsp(100000);
  const uri = "http://www.quantstamp.com/contract1.sol";
  let minAuditStake;
  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_view;
  let quantstamp_token;
  let quantstamp_audit_police;
  let quantstamp_audit_token_escrow;
  let police_timeout = 5;
  let audit_timeout = 10;

  // Helper function to empty the queue
  async function emptyQueue (n) {
    // remove requests
    let requestId;
    let result;
    await Util.stakeAuditor(quantstamp_token, quantstamp_audit, auditor, minAuditStake, owner);
    await quantstamp_audit.setAuditNodePrice(0, {from: auditor});
    for (let i = 0; i < n; i++){
      result = await quantstamp_audit.getNextAuditRequest({from: auditor});
      requestId = Util.extractRequestId(result);
      await quantstamp_audit.submitReport(requestId, Util.AuditState.Completed, Util.emptyReport, {from: auditor});
    }
    await Util.mineNBlocks(police_timeout + audit_timeout + 1);
    await quantstamp_audit.unstake({from: auditor});
  }

  function median(numbers) {
    var numsLen = numbers.length;
    numbers = numbers.sort((a, b) => a - b);
    if (numsLen % 2 === 0) {
        // average of two middle numbers
        return (numbers[numsLen / 2 - 1] + numbers[numsLen / 2]) / 2;
    } else { // is odd
        // middle number only
        return numbers[(numsLen - 1) / 2];
    }
  }

  beforeEach(async function () {
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    quantstamp_audit_police = await QuantstampAuditPolice.deployed();
    quantstamp_audit_token_escrow = await QuantstampAuditTokenEscrow.deployed();

    await quantstamp_audit_view.setQuantstampAudit(quantstamp_audit.address);
    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_report_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_police.addAddressToWhitelist(quantstamp_audit.address);

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(1000), {from : requestor});
    // timeout requests
    await quantstamp_audit_data.setAuditTimeout(audit_timeout);
    // lower the police timeout
    await quantstamp_audit_police.setPoliceTimeoutInBlocks(police_timeout);
    // allow audit nodes to perform many audits at once
    await quantstamp_audit_data.setMaxAssignedRequests(1000);
    // add QuantstampAudit to the whitelist of the escrow
    await quantstamp_audit_token_escrow.addAddressToWhitelist(quantstamp_audit.address);
    minAuditStake = await quantstamp_audit_token_escrow.minAuditStake();
  });

  it("lets the owner change the QuantstampAudit address", async function () {
    const audit = await quantstamp_audit_view.audit.call();
    const another_quantstamp_audit_data = (await QuantstampAuditData.new(quantstamp_token.address)).address;
    const another_quantstamp_audit_report_data = (await QuantstampAuditReportData.new()).address;
    const another_quantstamp_audit_token_escrow = (await QuantstampAuditTokenEscrow.new(quantstamp_token.address)).address;
    const another_quantstamp_audit_police = (await QuantstampAuditPolice.new(another_quantstamp_audit_data, another_quantstamp_audit_token_escrow)).address;

    const another_quantstamp_audit = (await QuantstampAudit.new(another_quantstamp_audit_data,
                                                                another_quantstamp_audit_report_data,
                                                                another_quantstamp_audit_token_escrow,
                                                                another_quantstamp_audit_police)).address;

    // change QuantstampAudit to something else
    await quantstamp_audit_view.setQuantstampAudit(another_quantstamp_audit);
    assert.equal(await quantstamp_audit_view.audit.call(), another_quantstamp_audit);
    assert.equal(await quantstamp_audit_view.auditData.call(), another_quantstamp_audit_data);

    // only owner can change
    await Util.assertTxFail(quantstamp_audit_view.setQuantstampAudit(audit, {from : requestor}));

    // address should be valid
    await Util.assertTxFail(quantstamp_audit_view.setQuantstampAudit(Util.zeroAddress, {from : requestor}));

    // change it back
    await quantstamp_audit_view.setQuantstampAudit(audit);
  });

  it("returns zero for non-advertised minPrice", async function () {
    assert.equal(await quantstamp_audit_view.getMinAuditPriceSum(), 0);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceCount(), 0);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMin(), 0);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMax(), 0);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMedian(), 0);
  });

  it("returns proper stat for advertised minPrice", async function () {
    const prices = [8, 5, 6];
    const auditors = [auditor, accounts[4], accounts[5]];
    for (i in auditors) {
      // stake auditor
      await Util.stakeAuditor(quantstamp_token, quantstamp_audit, auditors[i], minAuditStake, owner);
      // advertise min price
      await quantstamp_audit.setAuditNodePrice(prices[i], {from: auditors[i]});
    }
    assert.equal(await quantstamp_audit_view.getMinAuditPriceSum(), prices.reduce((a, b) => a + b, 0));
    assert.equal(await quantstamp_audit_view.getMinAuditPriceCount(), prices.length);
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMin(), Math.min(...prices));
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMax(), Math.max(...prices));
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMedian(), Math.floor(median(prices)));

    // remove auditors from the staked list
    for (i in auditors) {
      await quantstamp_audit.unstake({from: auditors[i]});
    }
  });

  it("returns proper median for an even number of auditors", async function () {
    const prices = [20, 3, 5, 10];
    const auditors = [auditor, accounts[4], accounts[5], accounts[6]];
    for (i in auditors) {
      // stake auditor
      await Util.stakeAuditor(quantstamp_token, quantstamp_audit, auditors[i], minAuditStake, owner);
      // advertise min price
      await quantstamp_audit.setAuditNodePrice(prices[i], {from: auditors[i]});
    }
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMedian(), Math.floor(median(prices)));

    // remove auditors from the staked list
    for (i in auditors) {
      await quantstamp_audit.unstake({from: auditors[i]});
    }
  });

  it("returns proper median if some auditors are not fully staked", async function () {
    const allPrices = [20, 3, 5, 10];
    const stakedPrices = [3, 5, 10];
    const auditors = [auditor, accounts[4], accounts[5], accounts[6]];
    const stakedEnough = [false, true, true, true];
    let currentStake;
    for (var i = 0; i < auditors.length; i++) {
      // stake auditor
      if (stakedEnough[i]) {
        currentStake = minAuditStake;
      } else {
        currentStake = 1;
      }
      await Util.stakeAuditor(
        quantstamp_token,
        quantstamp_audit,
        auditors[i],
        currentStake,
        owner,
        stakeCheck=stakedEnough[i]);
      // advertise min price
      await quantstamp_audit.setAuditNodePrice(allPrices[i], {from: auditors[i]});
    }
    assert.equal(await quantstamp_audit_view.getMinAuditPriceMedian(), Math.floor(median(stakedPrices)));

    // remove auditors from the staked list
    for (i in auditors) {
      await quantstamp_audit.unstake({from: auditors[i]});
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
    const report = "0xab";
    const hashOfNonExistedReport = await quantstamp_audit_view.getReportHash(notRequestedRequestId);

    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
      await Util.stakeAuditor(quantstamp_token, quantstamp_audit, auditor, minAuditStake, owner);
    const requestId = Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from: auditor}));
    await quantstamp_audit.submitReport(requestId, Util.AuditState.Completed, report, {from: auditor});

    const hashOfReport = await quantstamp_audit_view.getReportHash(requestId);
    assert.notEqual(hashOfNonExistedReport, hashOfReport);
  });

  it("should return the lower cap", async function () {
    const price = 123;
    await quantstamp_audit.setMinAuditPriceLowerCap(price, {from: owner});
    assert.equal(price, await quantstamp_audit_view.getMinAuditPriceLowerCap());
  });
});
