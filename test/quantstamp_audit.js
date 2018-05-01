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

  it("getQueueCapacity() returns default queue capacity", async function() {
    const capacity = await quantstamp_audit.getQueueCapacity.call();
    assert.equal(capacity.toNumber(), 30000); // intenionally hard-coded to spot changes to capacity
  });

  it("detects timeout for a given request ID", async function() {
    const requestId = requestCounter++;
    const requestId2 = requestCounter++;
    const timeoutInBlocks = 1;
    await quantstamp_audit.setAuditTimeout(timeoutInBlocks);
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});

    const result = await quantstamp_audit.detectTimeout(requestId);
    assertEventAtIndex({
      result: result,
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, 0);
        assert.equal(args.auditResult, AuditState.Timeout);
        assert.equal(args.reportUri, "");
        assert.equal(args.reportHash, "");
      },
      index: 0
    });

    assertEventAtIndex({
      result: result,
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      },
      index: 1
    });

    // remove the next request from the queue
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.submitReport(requestCounter, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor});
  });

  it("detects multiple timeouts in a row", async function() {
    const requestId = requestCounter++;
    const requestId2 = requestCounter++;
    const requestId3 = requestCounter++;

    const timeoutInBlocks = 1;
    // cleanup the queue first
    await quantstamp_audit.detectAuditTimeouts();
    await quantstamp_audit.setAuditTimeout(timeoutInBlocks);
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    const result = await quantstamp_audit.detectAuditTimeouts();
    assertEventAtIndex({
      result: result,
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, 0);
        assert.equal(args.auditResult, AuditState.Timeout);
        assert.equal(args.reportUri, "");
        assert.equal(args.reportHash, "");
      },
      index: 0
    });
    assertEventAtIndex({
      result: result,
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      },
      index: 1
    });
    assertEventAtIndex({
      result: result,
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
        assert.equal(args.auditor, 0);
        assert.equal(args.auditResult, AuditState.Timeout);
        assert.equal(args.reportUri, "");
        assert.equal(args.reportHash, "");
      },
      index: 2
    });
    assertEventAtIndex({
      result: result,
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      },
      index: 3
    });

    // remove from the queue
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.submitReport(requestId3, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor});
  });

  it("detects the timeout if it occurs before the next completed audits", async function() {
    const requestId = requestCounter++;
    const requestId2 = requestCounter++;
    const requestId3 = requestCounter++;

    const timeoutInBlocks = 1;
    // cleanup the queue first
    await quantstamp_audit.detectAuditTimeouts();
    await quantstamp_audit.setAuditTimeout(timeoutInBlocks);
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.requestAudit(uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.submitReport(requestId2, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor});
    await quantstamp_audit.submitReport(requestId3, AuditState.Completed, reportUri, sha256emptyFile, {from: auditor});
  
    const result = await quantstamp_audit.detectTimeout(requestId);
    assertEventAtIndex({
      result: result,
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, 0);
        assert.equal(args.auditResult, AuditState.Timeout);
        assert.equal(args.reportUri, "");
        assert.equal(args.reportHash, "");
      },
      index: 0
    });
    assertEventAtIndex({
      result: result,
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      },
      index: 1
    });
  });
});
