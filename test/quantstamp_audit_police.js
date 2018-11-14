/*
TODO remove
it("should pay the auditor for their work", async function () {
    const price = Util.toQsp(35);
    requestCounter++;
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor});
    const requestId = Util.extractRequestId(result);

    Util.assertEventAtIndex({
      result: result,
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
      },
      index: 0
    });

    const result2 = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId2 = Util.extractRequestId(result2);
    Util.assertEvent({
      result: result2,
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
        assert.equal(args.auditor, auditor);
      }
    });

    const result3 = await quantstamp_audit.submitReport(requestId2, AuditState.Completed, Util.emptyReport, {from : auditor});

    Util.assertEventAtIndex({
      result: result3,
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
        assert.equal(args.auditor, auditor);
        assert.equal(args.auditResult, AuditState.Completed);
      },
      index: 0
    });

    Util.assertEventAtIndex({
      result: result3,
      name: "LogPayAuditor",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
        assert.equal(args.auditor, auditor);
        assert.equal(args.amount, price);
      },
      index: 1
    });

    const res = await quantstamp_audit.isAuditFinished(requestId2);
    assert.equal(await quantstamp_audit.isAuditFinished(requestId2), true);
    // all contract's tokens should be moved to the auditor's wallet
    assert.equal(await Util.balanceOf(quantstamp_token, auditor), price);
  });
*/

const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');

const Util = require("./util.js");
const AuditState = Util.AuditState;


contract('QuantstampAuditPolice', function(accounts) {
  const owner = accounts[0];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const police1 = accounts[4];
  const police2 = accounts[5];
  const police3 = accounts[6];
  let all_police = [police1, police2, police3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  const maxAssignedRequests = 100;
  const approvalAmount = 1000;
  const audit_timeout = 10;
  const police_timeout = 15;
  let currentId;

  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_multirequest_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_view;
  let quantstamp_token;
  let quantstamp_audit_police;

  async function initialize() {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_multirequest_data = await QuantstampAuditMultiRequestData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_police = await QuantstampAuditPolice.deployed();

    await quantstamp_audit_report_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_multirequest_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_police.addAddressToWhitelist(quantstamp_audit.address);

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // lower the audit timeout
    await quantstamp_audit_data.setAuditTimeout(audit_timeout);
    // lower the police timeout
    await quantstamp_audit_police.setPoliceTimeoutInBlocks(police_timeout);
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(approvalAmount), {from : requestor});
    // whitelisting auditor
    await quantstamp_audit_data.addNodeToWhitelist(auditor);
    // relaxing the requirement for other tests
    await quantstamp_audit_data.setMaxAssignedRequests(maxAssignedRequests);
  }

  // an audit is requested and a report is submitted
  async function submitNewReport() {
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = Util.extractRequestId(result);
    await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from : auditor});
    return requestId;
  }

  before(async function() {
    await initialize();
    // add police to whitelist
    for(var i = 0; i < all_police.length; i++) {
      await quantstamp_audit_police.addPoliceNode(all_police[i]);
    }
  });

  it("should not allow an auditor to claim the reward before the policing period finishes", async function() {
    currentId = await submitNewReport();
    Util.assertTxFail(quantstamp_audit.claimAuditReward(currentId, {from: auditor}));
  });

  it("should not allow a regular user to submit a police report");


  it("should not allow a non-auditor to claim the reward", async function() {
    const num_blocks = police_timeout + 1;
    Util.mineNBlocks(num_blocks);
    Util.assertTxFail(quantstamp_audit.claimAuditReward(currentId, {from: requestor}));
  });

  it("should not allow the police to submit a report after the police timeout");


  it("should allow an auditor to claim the reward after the policing period when not verified", async function() {
    const police_report_state = await quantstamp_audit_police.verifiedReports(currentId);
    assert.equal(police_report_state, Util.PoliceReportState.Unverified);
    const result = await quantstamp_audit.claimAuditReward(currentId, {from: auditor});
    Util.assertEvent({
      result: result,
      name: "LogPayAuditor",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), currentId);
        assert.equal(args.auditor, auditor);
        assert.equal(args.amount, price);
      }
    });
  });

  it("should allow an auditor to claim the reward after the policing period when verified");
  it("should not allow an auditor to claim the reward after the policing period when report is marked invalid");
  it("should assign all police to a report if policeNodesPerReport == numPoliceNodes");
  it("should allow the owner to set policeNodesPerReport");
  it("should assign all police to a report if policeNodesPerReport > numPoliceNodes");
  it("should correctly move the next police pointer if that police node is removed");
  it("should properly rotate police assignments");
  it("should allow the police to submit a positive report");
  it("should allow the police to submit a negative report");
  it("the report should remain invalid even if a positive report is received after a negative report");
  it("should not allow the police to submit a report that they are not assigned");
  it("should remove expired assignments");

});

