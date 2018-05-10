const Util = require("./util.js");
const AuditState = Util.AuditState;
const assertEvent = Util.assertEvent;
const assertEventAtIndex = Util.assertEventAtIndex;
const extractRequestId = Util.extractRequestId;

const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampToken = artifacts.require('QuantstampToken');


contract('QuantstampAudit_refunds', function(accounts) {
  const owner = accounts[0];
  const admin = accounts[1];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  const uri = "http://www.quantstamp.com/contract1.sol";
  const reportUri = "http://www.quantstamp.com/report.md";
  const sha256emptyFile = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  let requestCounter = 1;
  let globalRequestId = 0;
  let quantstamp_audit;
  let quantstamp_token;

  beforeEach(async function () {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_token = await QuantstampToken.deployed();
    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(1000), {from : requestor});
    // whitelisting auditor
    await quantstamp_audit.addAddressToWhitelist(auditor);
    // allow audit nodes to perform many audits at once
    await quantstamp_audit.setMaxAssignedRequests(1000);
  });

  it("should disallow refunds for bogus request IDs", async function () {
    const bogusId = 123456;
    assertEvent({
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
    const result = await quantstamp_audit.requestAudit(uri, price, {from : requestor});
    const sizeBeforeRefund = await quantstamp_audit.getQueueLength.call();
    assert.equal(await Util.balanceOf(quantstamp_token, requestor), requestorBalance - price);
    const requestId = extractRequestId(result);
    assertEvent({
      result: await quantstamp_audit.refund(requestId, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      }
    });
    assert.equal(await quantstamp_audit.getQueueLength.call(), sizeBeforeRefund - 1);
    assert.equal(await Util.balanceOf(quantstamp_token, requestor), requestorBalance);
  });

  it("should not allow a user that did not submit the request to get a refund", async function () {
    const result = await quantstamp_audit.requestAudit(uri, price, {from : requestor});
    globalRequestId = extractRequestId(result);
    const bogusRequestor = accounts[5];
    assertEvent({
      result: await quantstamp_audit.refund(globalRequestId, {from: bogusRequestor}),
      name: "LogRefundInvalidRequestor",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), globalRequestId);
        assert.equal(args.requestor, bogusRequestor);
      }
    });
  });

  it("should not allow a requestor to get a refund after a report has been submitted", async function () {
    assert(await quantstamp_audit.getQueueLength.call(), 1);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await quantstamp_audit.submitReport(globalRequestId, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor});
    
    assertEvent({
      result: await quantstamp_audit.refund(globalRequestId, {from: requestor}),
      name: "LogRefundInvalidState",
      args: (args) => {
        assert.equal(args.requestId, globalRequestId);
        assert.equal(args.state, AuditState.Completed);
      }
    });
  });

  it("should not allow an auditor to submit a report after a refund", async function () {
    const result = await quantstamp_audit.requestAudit(uri, price, {from : requestor});
    const requestId = extractRequestId(result);
    await quantstamp_audit.refund(requestId, {from: requestor});
    assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor}),
      name: "LogReportSubmissionError_InvalidState",
      args: (args) => {
        assert.equal(args.requestId, requestId);
        assert.equal(args.auditor, auditor);
        assert.equal(args.state, AuditState.Refunded);
      }
    });
  });
  
  it("should not allow the requestor to get a refund during the lock period", async function () {
    assert(await quantstamp_audit.getQueueLength.call(), 0);
    const result = await quantstamp_audit.requestAudit(uri, price, {from : requestor});
    globalRequestId = extractRequestId(result);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    assertEvent({
      result: await quantstamp_audit.refund(globalRequestId, {from: requestor}),
      name: "LogRefundInvalidFundsLocked",
      args: (args) => {
        assert.equal(args.requestId, globalRequestId);
      }
    });

  });

  it("should allow the requestor to get a refund after the lock period", async function () {
    await quantstamp_audit.setAuditTimeout(0);
    assertEvent({
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
    const result = await quantstamp_audit.requestAudit(uri, price, {from : requestor});
    const id1 = extractRequestId(result);
    const result2 = await quantstamp_audit.requestAudit(uri, price, {from : requestor});
    const id2 = extractRequestId(result2);
    const result3 = await quantstamp_audit.requestAudit(uri, price, {from : requestor});
    const id3 = extractRequestId(result3);
    assertEvent({
      result: await quantstamp_audit.refund(id2, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId, id2);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      }
    });
    assertEvent({
      result: await quantstamp_audit.refund(id3, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId, id3);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      }
    });
    assertEvent({
      result: await quantstamp_audit.refund(id1, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId, id1);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      }
    });
  });


  
  it("should allow the auditor to submit an audit after the lock period", async function () {
    assert(await quantstamp_audit.getQueueLength.call(), 0);
    await quantstamp_audit.requestAudit(uri, price, {from : requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from:auditor});
    const requestId = extractRequestId(result);

    assertEventAtIndex({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor}),
      name: "LogAuditFinished",
      args: (args) => {},
      index: 0
    });
  });

});
