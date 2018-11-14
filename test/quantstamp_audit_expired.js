const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');

const Util = require("./util.js");
const AuditState = Util.AuditState;

contract('QuantstampAudit_expires', function(accounts) {
  const owner = accounts[0];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  const timeout = 2;
  const maxAssigned = 100;

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
    // allow audit nodes to perform many audits at once
    await quantstamp_audit_data.setMaxAssignedRequests(maxAssigned);
    // timeout requests
    await quantstamp_audit_data.setAuditTimeout(timeout);
  });

  it("should adjust expired requests in each call for bidding request", async function () {
    const requestedId = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));

    Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from:auditor}));
    await Util.mineNBlocks(timeout-1);

    // let's spend one block
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from:auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });

    Util.assertEventAtIndex({
      result: await quantstamp_audit.getNextAuditRequest({from:auditor}),
      name: "LogAuditAssignmentUpdate_Expired",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId);
      },
      index: 0
    });
  });

  it("should not adjust expired requests while there is time", async function () {
    const requestedId = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));

    Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from:auditor}));

    // let's spend one block
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from:auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });

    // let's spend another block
    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from:auditor}),
      name: "LogAuditQueueIsEmpty",
      args: (args) => {}
    });

    Util.assertEventAtIndex({
      result: await quantstamp_audit.getNextAuditRequest({from:auditor}),
      name: "LogAuditAssignmentUpdate_Expired",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId);
      },
      index: 0
    });
  });

  it("should update the assigned queue and states accordingly", async function () {
    // do white box testing for increasing coverage
    const requestedId1 = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    const requestedId2 = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price + 1, {from : requestor}));

    await quantstamp_audit.getNextAuditRequest({from:auditor});
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), requestedId2);
    await Util.mineNBlocks(timeout - 1);
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), requestedId2);
    await Util.mineNBlocks(1);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), requestedId1);
    assert.equal((await quantstamp_audit_data.getAuditState(requestedId2)).toNumber(), Util.AuditState.Expired);
    // clean the assigned queue
    await Util.mineNBlocks(timeout);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), 0);
  });

  it("should not allow audit to submit after time allowance", async function () {
    const requestedId = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await Util.mineNBlocks(timeout);

    // white box testing
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), requestedId);

    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestedId, AuditState.Completed, Util.reportUri, Util.emptyReport, {from: auditor}),
      name: "LogReportSubmissionError_ExpiredAudit",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId);
        assert.equal(args.auditor, auditor);
        // one less due to new block for calling submitReport
        assert.equal(args.allowanceBlockNumber.toNumber(), web3.eth.blockNumber - 1);
      }
    });

    // white box testing
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), 0);
    assert.equal((await quantstamp_audit_data.getAuditState(requestedId)).toNumber(), Util.AuditState.Expired);
  });

  it("should let requester refund an expired request", async function () {
    const requestedId = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await Util.mineNBlocks(timeout);

    Util.assertEventAtIndex({
      result: await quantstamp_audit.getNextAuditRequest({from:auditor}),
      name: "LogAuditAssignmentUpdate_Expired",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId);
      },
      index: 0
    });

    assert.equal((await quantstamp_audit_data.getAuditState(requestedId)).toNumber(), Util.AuditState.Expired);

    Util.assertEvent({
      result: await quantstamp_audit.refund(requestedId, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      }
    });
  });

  it("should not leave a request in the assigned queue after a refund", async function () {
    const requestedId = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await Util.mineNBlocks(timeout);

    // white box testing
    assert.equal((await quantstamp_audit_data.getAuditState(requestedId)).toNumber(), Util.AuditState.Assigned);
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), requestedId);

    Util.assertEvent({
      result: await quantstamp_audit.refund(requestedId, {from: requestor}),
      name: "LogRefund",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId);
        assert.equal(args.requestor, requestor);
        assert.equal(args.amount, price);
      }
    });

    // white box testing
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), 0);
  });

  it("should decrease number of assigned requests after submitting an expired request", async function () {
    await quantstamp_audit_data.setMaxAssignedRequests(1);
    const requestedId1 = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    const requestedId2 = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    await quantstamp_audit.getNextAuditRequest({from:auditor});

    Util.assertEvent({
      result: await quantstamp_audit.getNextAuditRequest({from:auditor}),
      name: "LogAuditAssignmentError_ExceededMaxAssignedRequests",
      args: (args) => {
        assert.equal(args.auditor, auditor);
      }
    });

    // white box testing
    assert.equal((await quantstamp_audit.assignedRequestCount.call(auditor)).toNumber(), 1);

    await Util.mineNBlocks(timeout);

    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestedId1, AuditState.Completed, Util.emptyReport, {from: auditor}),
      name: "LogReportSubmissionError_ExpiredAudit",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId1);
        assert.equal(args.auditor, auditor);
      }
    });

    // white box testing
    assert.equal((await quantstamp_audit.assignedRequestCount.call(auditor)).toNumber(), 0);
    // let's cleanup the queues
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    Util.assertEventAtIndex({
      result: await quantstamp_audit.submitReport(requestedId2, AuditState.Completed, Util.emptyReport, {from: auditor}),
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId2);
        assert.equal(args.auditor, auditor);
        assert.equal(args.auditResult, AuditState.Completed);
      },
      index: 0
    });
  });

  it("should decrease number of assigned requests after detecting an expired request in getNextAuditRequest", async function () {
    await quantstamp_audit_data.setMaxAssignedRequests(1);
    const auditor2 = accounts[4];
    await quantstamp_audit_data.addNodeToWhitelist(auditor2);
    const requestedId1 = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    const requestedId2 = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await Util.mineNBlocks(timeout);

    assert.equal((await quantstamp_audit.assignedRequestCount.call(auditor)).toNumber(), 1);

    // another node is taking care of expired requests
    const getNextAuditRequestResult = await quantstamp_audit.getNextAuditRequest({from:auditor2});

    Util.assertEventAtIndex({
      result: getNextAuditRequestResult,
      name: "LogAuditAssignmentUpdate_Expired",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId1);
      },
      index: 0
    });

    Util.assertEventAtIndex({
      result: getNextAuditRequestResult,
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestedId2);
        assert.equal(args.auditor, auditor2);
      },
      index: 1
    });
    // white box testing
    assert.equal((await quantstamp_audit.assignedRequestCount.call(auditor)).toNumber(), 0);

    // clean up
    await quantstamp_audit.submitReport(requestedId2, AuditState.Completed, Util.emptyReport, {from: auditor2});
    await quantstamp_audit_data.removeNodeFromWhitelist(auditor2);
  });

  it("should decrease number of assigned requests after calling a refund for an assigned but expired request", async function () {
    await quantstamp_audit_data.setMaxAssignedRequests(1);
    const requestedId = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await Util.mineNBlocks(timeout);

    assert.equal((await quantstamp_audit.assignedRequestCount.call(auditor)).toNumber(), 1);
    assert.equal((await quantstamp_audit_data.getAuditState(requestedId)).toNumber(), Util.AuditState.Assigned);
    await quantstamp_audit.refund(requestedId, {from: requestor});
    assert.equal((await quantstamp_audit.assignedRequestCount.call(auditor)).toNumber(), 0);
  });
});
