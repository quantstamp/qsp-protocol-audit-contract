const Util = require("./util.js");

const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampToken = artifacts.require('QuantstampToken');


const AuditState = Object.freeze({
  None : 0,
  Queued : 1,
  Assigned : 2,
  Completed : 3,
  Error : 4,
  Timeout : 5
});

contract('QuantstampAudit', function(accounts) {
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
    // relaxing the requirement for other tests
    await quantstamp_audit.setMaxAssignedRequests(100);
  });

  function assertEvent({result, name, args}) {
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].event, name);
    args(result.logs[0].args);
  }

  function assertEventAtIndex({result, name, args, index}) {
    assert.equal(result.logs[index].event, name);
    args(result.logs[index].args);
  }

  it("queues new audits and assigns them in the right order", async function() {
    const requestId1 = requestCounter++;
    const requestId2 = requestCounter++;
    const requestId3 = requestCounter++;

    assert(await quantstamp_audit.getQueueLength.call(), 0);
    assertEvent({
        result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });

    assertEvent({
      result: await quantstamp_audit.requestAudit(uri, price, {from:requestor}),
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId1);
      }
    });

    assert(await quantstamp_audit.getQueueLength.call(), 1);

    assertEvent({
      result: await quantstamp_audit.requestAudit(uri, price, {from:requestor}),
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
      }
    });

    assert(await quantstamp_audit.getQueueLength.call(), 2);
    assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId1);
        assert.equal(args.auditor, auditor);
      }
    });

    assert(await quantstamp_audit.getQueueLength.call(), 1);
    assertEvent({
      result: await quantstamp_audit.requestAudit(uri, price, {from:requestor}),
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId3);
      }
    });

    assert(await quantstamp_audit.getQueueLength.call(), 2);
    assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
        assert.equal(args.auditor, auditor);
      }
    });

    assert(await quantstamp_audit.getQueueLength.call(), 1);
    assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId3);
        assert.equal(args.auditor, auditor);
      }
    });

    assert(await quantstamp_audit.getQueueLength.call(), 0);
    assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });
  });

  it("submits a report when audit is queued and auditor is correct", async function() {
    const requestId = requestCounter++;
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});

    const result = await quantstamp_audit.submitReport(requestId, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor});
    assertEventAtIndex({
      result: result,
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
        assert.equal(args.auditResult, AuditState.Completed);
        assert.equal(args.reportUri, reportUri);
        assert.equal(args.reportHash, sha256emptyFile);
      },
      index: 0
    });

    assertEventAtIndex({
      result: result,
      name: "LogPayAuditor",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
        assert.equal(args.amount, price);
      },
      index: 1
    });
  });

  it("does not submit a report when already audited", async function() {
    const requestId = requestCounter++;
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.submitReport(requestId, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor});

    assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor}),
      name: "LogReportSubmissionError_InvalidState",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.state, AuditState.Completed);
      }
    });
  });

  it("does not assign an audit when the queue is empty", async function() {
    assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });
  });

  it("getQueueLength() returns queue length", async function() {
    const length = await quantstamp_audit.getQueueLength.call();
    assert.equal(length.toNumber(), 0); // queue should be empty by the end of each test
  });

  it("should prevent not-whitelisted auditor to get next audit request", async function() {
    const auditor = accounts[4];
    const requestId = requestCounter++;

    // for the sake of dependency, let's ensure the auditor is not in the whitelist
    await quantstamp_audit.removeAddressFromWhitelist(auditor);

    Util.assertTxFail(quantstamp_audit.getNextAuditRequest({from: auditor}));
  });

  it("should prevent not-whitelisted auditor to submit a report", async function() {
    const auditor = accounts[4];
    const requestId = requestCounter++;

    // for the sake of dependency, let's ensure the auditor is not in the whitelist
    await quantstamp_audit.removeAddressFromWhitelist(auditor);

    Util.assertTxFail(quantstamp_audit.submitReport(requestId, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor}));
  });

  it("should prevent a requestor to request an audit if owner paused", async function() {
    // for the sake of dependency, let's ensure the auditor is not in the whitelist
    await quantstamp_audit.pause();

    Util.assertTxFail(quantstamp_audit.requestAudit(uri, price, {from: requestor}));
    await quantstamp_audit.unpause();
  });

  it("does not get another request before finishes the previous one", async function() {
    const auditor = accounts[4];
    const pendingAuditsNum = (await quantstamp_audit.assignedRequestsNum.call(auditor)).toNumber();

    await quantstamp_audit.setMaxAssignedRequests(pendingAuditsNum + 1);
    await quantstamp_audit.addAddressToWhitelist(auditor);

    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});

    await quantstamp_audit.getNextAuditRequest({from: auditor});
    Util.assertTxFail(quantstamp_audit.getNextAuditRequest({from: auditor}));
  });

  it("should get a request after finishing the previous one", async function() {
    const auditor = accounts[4];

    await quantstamp_audit.addAddressToWhitelist(auditor);
    const pendingAuditsNum = (await quantstamp_audit.assignedRequestsNum.call(auditor)).toNumber();
    await quantstamp_audit.setMaxAssignedRequests(pendingAuditsNum + 1);

    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});

    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});

    assertEvent({
        result: result,
        name: "LogAuditAssigned",
        args: (args) => {}
    });

    const grantedRequestId = result.logs[0].args.requestId.toNumber();
    await quantstamp_audit.submitReport(grantedRequestId, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor});

    assertEvent({
        result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
        name: "LogAuditAssigned",
        args: (args) => {}
    });

  });

  it("does not get another request before finishing the previous one even if it submitted a report before", async function() {
    const auditor = accounts[4];

    await quantstamp_audit.addAddressToWhitelist(auditor);
    const pendingAuditsNum = (await quantstamp_audit.assignedRequestsNum.call(auditor)).toNumber();
    await quantstamp_audit.setMaxAssignedRequests(pendingAuditsNum + 1);

    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});

    assertEvent({
      result: result,
      name: "LogAuditAssigned",
      args: (args) => {}
    });

    const grantedRequestId = result.logs[0].args.requestId.toNumber();
    await quantstamp_audit.submitReport(grantedRequestId, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor});

    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});

    await quantstamp_audit.getNextAuditRequest({from: auditor});

    Util.assertTxFail(quantstamp_audit.getNextAuditRequest({from: auditor}));
  });

});
