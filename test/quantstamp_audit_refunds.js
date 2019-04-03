const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');
const BN = require('bn.js');
const Util = require("./util.js");
const AuditState = Util.AuditState;

contract('QuantstampAudit_refunds', function(accounts) {
  const owner = accounts[0];
  const admin = accounts[1];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  let minAuditStake;

  let globalRequestId = 0;
  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_view;
  let quantstamp_token;
  let quantstamp_audit_police;
  let quantstamp_audit_token_escrow;

  beforeEach(async function () {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    quantstamp_token = await QuantstampToken.deployed();
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
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(1000), {from : requestor});
    // allow audit nodes to perform many audits at once
    await quantstamp_audit_data.setMaxAssignedRequests(1000);
    // timeout requests
    await quantstamp_audit_data.setAuditTimeout(10000);
    // add QuantstampAudit to the whitelist of the escrow
    await quantstamp_audit_token_escrow.addAddressToWhitelist(quantstamp_audit.address);
    minAuditStake = await quantstamp_audit_token_escrow.minAuditStake();
    await Util.stakeAuditor(quantstamp_token, quantstamp_audit, auditor, minAuditStake, owner);
  });

  it("should disallow refunds for bogus request IDs", async function () {
    const bogusId = 123456;
    Util.assertEvent({
      result: await quantstamp_audit.refund(bogusId, {from: requestor}),
      name: "LogRefundInvalidState",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), bogusId);
        assert.equal(args.state, AuditState.None);
      }
    });
  });

  it("should allow for refunds immediately after requesting, decreasing the queue size", async function () {
    const price = Util.toQsp(35);
    const requestorBalance = await Util.balanceOf(quantstamp_token, requestor);
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor});
    const sizeBeforeRefund = await quantstamp_audit_view.getQueueLength.call();
    assert.isTrue((await Util.balanceOf(quantstamp_token, requestor)).eq(requestorBalance.sub(price)));
    const requestId = Util.extractRequestId(result);
    assert.equal(await Util.getAuditState(quantstamp_audit_data, requestId), AuditState.Queued);

    Util.assertEvent({
      result: await quantstamp_audit.refund(requestId, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.requestor, requestor);
        assert.isTrue(args.amount.eq(new BN(price)));
      }
    });
    assert.equal(await quantstamp_audit_view.getQueueLength.call(), sizeBeforeRefund - 1);
    assert.equal(await Util.getAuditState(quantstamp_audit_data, requestId), AuditState.Refunded);
    assert.isTrue((await Util.balanceOf(quantstamp_token, requestor)).eq(requestorBalance));
  });

  it("should not allow a user that did not submit the request to get a refund", async function () {
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor});
    globalRequestId = Util.extractRequestId(result);
    const bogusRequestor = accounts[5];
    Util.assertEvent({
      result: await quantstamp_audit.refund(globalRequestId, {from: bogusRequestor}),
      name: "LogRefundInvalidRequestor",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), globalRequestId);
        assert.equal(args.requestor, bogusRequestor);
      }
    });
  });

  it("should not allow a requestor to get a refund after a report has been submitted", async function () {
    assert(await quantstamp_audit_view.getQueueLength.call(), 1);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await quantstamp_audit.submitReport(globalRequestId, AuditState.Completed, Util.emptyReport, {from: auditor});

    Util.assertEvent({
      result: await quantstamp_audit.refund(globalRequestId, {from: requestor}),
      name: "LogRefundInvalidState",
      args: (args) => {
        assert.equal(args.requestId, globalRequestId);
        assert.equal(args.state, AuditState.Completed);
      }
    });
  });

  it("should not allow an auditor to submit a report after a refund", async function () {
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor});
    const requestId = Util.extractRequestId(result);
    await quantstamp_audit.refund(requestId, {from: requestor});
    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor}),
      name: "LogReportSubmissionError_InvalidState",
      args: (args) => {
        assert.equal(args.requestId, requestId);
        assert.equal(args.auditor, auditor);
        assert.equal(args.state, AuditState.Refunded);
      }
    });
  });

  it("should not allow the requestor to get a refund during the lock period", async function () {
    assert(await quantstamp_audit_view.getQueueLength.call(), 0);
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor});
    globalRequestId = Util.extractRequestId(result);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    Util.assertEvent({
      result: await quantstamp_audit.refund(globalRequestId, {from: requestor}),
      name: "LogRefundInvalidFundsLocked",
      args: (args) => {
        assert.equal(args.requestId, globalRequestId);
      }
    });

  });

  it("should allow the requestor to get a refund after the lock period", async function () {
    await quantstamp_audit_data.setAuditTimeout(0);
    Util.assertEvent({
      result: await quantstamp_audit.refund(globalRequestId, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId, globalRequestId);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      }
    });
  });

  it("should allow multiple requestors to get refunds with the same price", async function () {
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor});
    const id1 = Util.extractRequestId(result);
    const result2 = await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor});
    const id2 = Util.extractRequestId(result2);
    Util.assertEvent({
      result: await quantstamp_audit.refund(id2, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId, id2);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      }
    });
    Util.assertEvent({
      result: await quantstamp_audit.refund(id1, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId, id1);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      }
    });
  });

});
