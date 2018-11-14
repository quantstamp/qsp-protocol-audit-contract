const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');

const Util = require("./util.js");
const AuditState = Util.AuditState;


contract('QuantstampAudit', function(accounts) {
  const owner = accounts[0];
  const admin = accounts[1];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  const maxAssignedRequests = 100;

  let requestCounter = 1;
  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_multirequest_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_view;
  let quantstamp_token;
  let quantstamp_audit_police;


  beforeEach(async function () {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_multirequest_data = await QuantstampAuditMultiRequestData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_police = await QuantstampAuditPolice.deployed();

    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_multirequest_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_report_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_police.addAddressToWhitelist(quantstamp_audit.address);

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(1000), {from : requestor});
    // whitelisting auditor
    await quantstamp_audit_data.addNodeToWhitelist(auditor);
    // timeout requests
    await quantstamp_audit_data.setAuditTimeout(10000);
    // relaxing the requirement for other tests
    await quantstamp_audit_data.setMaxAssignedRequests(maxAssignedRequests);
  });

  it("queues new audits and assigns them in the right order", async function() {
    const requestId1 = requestCounter++;
    const requestId2 = requestCounter++;
    const requestId3 = requestCounter++;
    let assignedAudit;

    assert(await quantstamp_audit_view.getQueueLength.call(), 0);
    Util.assertEvent({
        result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });

    assignedAudit = await quantstamp_audit.myMostRecentAssignedAudit.call({from: auditor});
    assert.equal(assignedAudit[0].toNumber(), 0);

    Util.assertEvent({
      result: await quantstamp_audit.requestAudit(Util.uri, price, {from:requestor}),
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId1);
      }
    });

    assert(await quantstamp_audit_view.getQueueLength.call(), 1);

    Util.assertEvent({
      result: await quantstamp_audit.requestAudit(Util.uri, price, {from:requestor}),
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
      }
    });

    assert(await quantstamp_audit_view.getQueueLength.call(), 2);
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId1);
        assert.equal(args.auditor, auditor);
      }
    });

    assignedAudit = await quantstamp_audit.myMostRecentAssignedAudit.call({from: auditor});
    assert.equal(assignedAudit[0].toNumber(), requestId1);

    assert(await quantstamp_audit_view.getQueueLength.call(), 1);
    Util.assertEvent({
      result: await quantstamp_audit.requestAudit(Util.uri, price, {from:requestor}),
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId3);
      }
    });

    assert(await quantstamp_audit_view.getQueueLength.call(), 2);
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
        assert.equal(args.auditor, auditor);
      }
    });

    assignedAudit = await quantstamp_audit.myMostRecentAssignedAudit.call({from: auditor});
    assert.equal(assignedAudit[0].toNumber(), requestId2);

    assert(await quantstamp_audit_view.getQueueLength.call(), 1);
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId3);
        assert.equal(args.auditor, auditor);
      }
    });

    assignedAudit = await quantstamp_audit.myMostRecentAssignedAudit.call({from: auditor});
    assert.equal(assignedAudit[0].toNumber(), requestId3);

    assert(await quantstamp_audit_view.getQueueLength.call(), 0);
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });

    assignedAudit = await quantstamp_audit.myMostRecentAssignedAudit.call({from: auditor});
    assert.equal(assignedAudit[0].toNumber(), requestId3); // requestId3 (not 0) is intentional:
      // if there is no new audit available, the method returns the most recently assigned one
  });

  it("myMostRecentAssignedAudit() returns the right values when the given request id is assigned to the auditor", async function() {
    const requestId = requestCounter++;
    Util.assertEvent({
      result: await quantstamp_audit.requestAudit(Util.uri, price, {from:requestor}),
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
      }
    });
    
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
      }
    });

    const assignedAudit = await quantstamp_audit.myMostRecentAssignedAudit.call({from: auditor});
    assert.equal(assignedAudit[0].toNumber(), requestId);
    assert.equal(assignedAudit[1], requestor);
    assert.equal(assignedAudit[2], Util.uri);
    assert.equal(assignedAudit[3], price);
    assert(assignedAudit[4].toNumber() > 0); // block number
  });
  
  it("myMostRecentAssignedAudit() persists the most recent audit assigned to the auditor even after the queue became empty", async function() {
    const requestId = requestCounter++;
    Util.assertEvent({
      result: await quantstamp_audit.requestAudit(Util.uri, price, {from:requestor}),
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
      }
    });
    
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
      }
    });

    let assignedAudit = await quantstamp_audit.myMostRecentAssignedAudit.call({from: auditor});
    assert.equal(assignedAudit[0].toNumber(), requestId);
    
    Util.assertEvent({
        result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });

    assignedAudit = await quantstamp_audit.myMostRecentAssignedAudit.call({from: auditor});
    assert.equal(assignedAudit[0].toNumber(), requestId);
  });

  it("submits a report when audit is queued and auditor is correct", async function() {
    const requestId = requestCounter++;
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});

    const result = await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor});
    Util.assertEventAtIndex({
      result: result,
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
        assert.equal(args.auditResult, AuditState.Completed);
      },
      index: 0
    });
  });

  it("does not submit a report when already audited", async function() {
    const requestId = requestCounter++;
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    await quantstamp_audit.getNextAuditRequest({from: auditor});
    await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor});
    const state = await quantstamp_audit_data.getAuditState(requestId);
    assert.equal(state, AuditState.Completed);
    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor}),
      name: "LogReportSubmissionError_InvalidState",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.state, AuditState.Completed);
      }
    });
  });

  it("does not assign an audit when the queue is empty", async function() {
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });
  });

  it("getQueueLength() returns queue length", async function() {
    const length = await quantstamp_audit_view.getQueueLength.call();
    assert.equal(length.toNumber(), 0); // queue should be empty by the end of each test
  });

  it("should prevent not-whitelisted auditor to get next audit request", async function() {
    const auditor = accounts[4];
    const requestId = requestCounter++;

    // for the sake of dependency, let's ensure the auditor is not in the whitelist
    await quantstamp_audit_data.removeNodeFromWhitelist(auditor);

    Util.assertTxFail(quantstamp_audit.getNextAuditRequest({from: auditor}));
  });

  it("should prevent not-whitelisted auditor to submit a report", async function() {
    const auditor = accounts[4];
    const requestId = requestCounter++;

    // for the sake of dependency, let's ensure the auditor is not in the whitelist
    await quantstamp_audit_data.removeNodeFromWhitelist(auditor);

    Util.assertTxFail(quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor}));
  });

  it("should prevent a whitelisted user from submitting a report to an audit that they are not assigned", async function() {
    const auditor2 = accounts[4];
    await quantstamp_audit_data.addNodeToWhitelist(auditor);
    await quantstamp_audit_data.addNodeToWhitelist(auditor2);
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = Util.extractRequestId(result);

    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor2}),
      name: "LogReportSubmissionError_InvalidAuditor",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor2);
      }
    });

    await quantstamp_audit.submitReport(requestId, AuditState.Completed,  Util.emptyReport, {from: auditor});
    // for the sake of dependency, let's ensure the auditor is not in the whitelist
    await quantstamp_audit_data.removeNodeFromWhitelist(auditor2);
  });

  it("should prevent an audit from being submitted with a bad state", async function() {
    const auditor2 = accounts[4];
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = Util.extractRequestId(result);

    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.None,  Util.emptyReport, {from: auditor}),
      name: "LogReportSubmissionError_InvalidResult",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
      }
    });
    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Queued, Util.emptyReport, {from: auditor}),
      name: "LogReportSubmissionError_InvalidResult",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
      }
    });
    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Assigned, Util.emptyReport, {from: auditor}),
      name: "LogReportSubmissionError_InvalidResult",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
      }
    });
    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Refunded, Util.emptyReport, {from: auditor}),
      name: "LogReportSubmissionError_InvalidResult",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
      }
    });
    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Expired,  Util.emptyReport, {from: auditor}),
      name: "LogReportSubmissionError_InvalidResult",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
        assert.equal(args.auditor, auditor);
      }
    });

    await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor});
  });

  it("should prevent a requestor to request an audit if owner paused", async function() {
    // for the sake of dependency, let's ensure the auditor is not in the whitelist
    await quantstamp_audit.pause();

    Util.assertTxFail(quantstamp_audit.requestAudit(Util.uri, price, {from: requestor}));
    await quantstamp_audit.unpause();
  });

  it("does not get another request before finishes the previous one", async function() {
    const auditor2 = accounts[4];
    const pendingAuditsNum = (await quantstamp_audit.assignedRequestCount.call(auditor2)).toNumber();

    await quantstamp_audit_data.setMaxAssignedRequests(pendingAuditsNum + 1);
    await quantstamp_audit_data.addNodeToWhitelist(auditor2);

    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});

    await quantstamp_audit.getNextAuditRequest({from: auditor2});

    Util.assertEvent({
        result: await quantstamp_audit.getNextAuditRequest({from: auditor2}),
        name: "LogAuditAssignmentError_ExceededMaxAssignedRequests",
        args: (args) => {
        assert.equal(args.auditor, auditor2);
      }
    });
  });

  it("should get a request after finishing the previous one", async function() {
    const auditor2 = accounts[4];

    await quantstamp_audit_data.addNodeToWhitelist(auditor2);
    const pendingAuditsNum = (await quantstamp_audit.assignedRequestCount.call(auditor2)).toNumber();
    await quantstamp_audit_data.setMaxAssignedRequests(pendingAuditsNum + 1);

    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});

    const result = await quantstamp_audit.getNextAuditRequest({from: auditor2});

    Util.assertEvent({
        result: result,
        name: "LogAuditAssigned",
        args: (args) => {}
    });

    const grantedRequestId = result.logs[0].args.requestId.toNumber();
    await quantstamp_audit.submitReport(grantedRequestId, AuditState.Completed, Util.emptyReport, {from: auditor2});

    Util.assertEvent({
        result: await quantstamp_audit.getNextAuditRequest({from: auditor2}),
        name: "LogAuditAssigned",
        args: (args) => {}
    });

  });

  it("does not get another request before finishing the previous one even if it submitted a report before", async function() {
    const auditor2 = accounts[4];

    await quantstamp_audit_data.addNodeToWhitelist(auditor2);
    const pendingAuditsNum = (await quantstamp_audit.assignedRequestCount.call(auditor2)).toNumber();
    await quantstamp_audit_data.setMaxAssignedRequests(pendingAuditsNum + 1);

    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor2});

    Util.assertEvent({
      result: result,
      name: "LogAuditAssigned",
      args: (args) => {}
    });

    const grantedRequestId = result.logs[0].args.requestId.toNumber();
    await quantstamp_audit.submitReport(grantedRequestId, AuditState.Completed, Util.emptyReport, {from: auditor2});

    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});

    await quantstamp_audit.getNextAuditRequest({from: auditor2});

    Util.assertEvent({
        result: await quantstamp_audit.getNextAuditRequest({from: auditor2}),
        name: "LogAuditAssignmentError_ExceededMaxAssignedRequests",
        args: (args) => {
        assert.equal(args.auditor, auditor2);
      }
    });
  });

  it("should return proper codes for different audit availability cases", async function() {
    await quantstamp_audit_data.setMaxAssignedRequests(maxAssignedRequests);
    const auditor2 = accounts[5];
    const auditor3 = accounts[6];

    await quantstamp_audit_data.addNodeToWhitelist(auditor2);
    // auditor2 does not have any pending assigned request
    assert.equal((await quantstamp_audit.assignedRequestCount.call(auditor2)).toNumber(), 0);

    // empty the pending requests
    const queueSize = (await quantstamp_audit_view.getQueueLength.call()).toNumber();
    for (let i = 0; i < queueSize; ++i) {
      const requestId = Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from: auditor2}));
      await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor2});
    }

    // the queue is supposed to be empty for this test-case
    assert.equal(await quantstamp_audit_view.getQueueLength.call(), 0);
    assert.equal((await quantstamp_audit.anyRequestAvailable({from: auditor2})).toNumber(), 2);
    assert.equal((await quantstamp_audit.anyRequestAvailable({from: auditor3})).toNumber(), 0);

    await quantstamp_audit_data.setMaxAssignedRequests(1);
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    assert.equal((await quantstamp_audit.anyRequestAvailable({from: auditor2})).toNumber(), 1);

    let requestId = Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from: auditor2}));
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    assert.equal((await quantstamp_audit.anyRequestAvailable({from: auditor2})).toNumber(), 3);

    await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor2});

    const currentMinPrice = (await quantstamp_audit_data.getMinAuditPrice(auditor2, {from: auditor2})).toNumber();
    await quantstamp_audit.setAuditNodePrice(price + 1, {from: auditor2});
    assert.equal((await quantstamp_audit.anyRequestAvailable({from: auditor2})).toNumber(), 4);

    // make sure there is not pending assigned or unassigned request
    await quantstamp_audit.setAuditNodePrice(currentMinPrice, {from: auditor2});
    await quantstamp_audit_data.setMaxAssignedRequests(maxAssignedRequests);
    requestId = Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from: auditor2}));
    await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from: auditor2});
    assert.equal(await quantstamp_audit_view.getQueueLength.call(), 0);
    assert.equal((await quantstamp_audit.assignedRequestCount.call(auditor2)).toNumber(), 0);
    await quantstamp_audit_data.removeNodeFromWhitelist(auditor2);
  });

  it("should not let ask for request with zero price", async function() {
    Util.assertTxFail(quantstamp_audit.requestAudit(Util.uri, 0, {from: requestor}));
  });

  it("should record the requests's registrar", async function() {
    const fakeContract = accounts[5];
    assert.equal(await quantstamp_audit_view.getQueueLength.call(), 0);

    const requestedId = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor}));
    assert.equal(await quantstamp_audit_data.getAuditRegistrar.call(requestedId), quantstamp_audit.address);

    await quantstamp_audit_data.addAddressToWhitelist(fakeContract);

    await quantstamp_audit_data.setAuditRegistrar(requestedId, fakeContract, {from: fakeContract});
    assert.equal(await quantstamp_audit_data.getAuditRegistrar.call(requestedId), fakeContract);

    // clean up
    await quantstamp_audit_data.removeAddressFromWhitelist(fakeContract);
    const requestId2 = Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from: auditor}));
    await quantstamp_audit.submitReport(requestId2, AuditState.Completed, Util.emptyReport, {from: auditor});
    assert.equal(await quantstamp_audit_view.getQueueLength.call(), 0);
  });
});
