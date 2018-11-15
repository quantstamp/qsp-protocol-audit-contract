const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');

const Util = require("./util.js");
const AuditState = Util.AuditState;
const abiDecoder = require('abi-decoder');

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

    // used to decode events in QuantstampAuditPolice
    abiDecoder.addABI(quantstamp_audit_police.abi);

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
    await Util.assertTxFail(quantstamp_audit.claimAuditReward(currentId, {from: auditor}));
  });

  it("should not allow a regular user to submit a police report", async function() {
    await Util.assertTxFail(quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: requestor}));
  });

  it("should not allow a non-auditor to claim the reward", async function() {
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);
    await Util.assertTxFail(quantstamp_audit.claimAuditReward(currentId, {from: requestor}));
  });

  it("should not allow the police to submit a report after the police timeout", async function() {
    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: police1});

    Util.assertNestedEvent({
      result: result,
      name: "PoliceSubmissionPeriodExceeded",
      args: (args) => {
        assert.equal(args.requestId, currentId);
      }
    });

    // check that the report map is still empty
    const report = await quantstamp_audit_police.getPoliceReport(currentId, police1);
    assert.equal(report, Util.emptyReportStr);

  });

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

  it("should allow the police to submit a positive report", async function() {
    currentId = await submitNewReport();
    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: police1});

    Util.assertNestedEvent({
      result: result,
      name: "PoliceReportSubmitted",
      args: (args) => {
        assert.equal(args.policeNode, police1);
        assert.equal(args.requestId, currentId);
        assert.equal(args.reportState, Util.PoliceReportState.Valid);
      }
    });

    // the police report state has been updated
    const police_report_state = await quantstamp_audit_police.verifiedReports(currentId);
    assert.equal(police_report_state, Util.PoliceReportState.Valid);

    // check that the report is added to the map
    const report = await quantstamp_audit_police.getPoliceReport(currentId, police1);
    assert.equal(report, Util.nonEmptyReport);
  });

  it("should allow an auditor to claim the reward after the policing period when verified", async function() {
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);
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
    // TODO: check QSP balance before and after
  });

  it("should allow the police to submit a negative report", async function() {
    currentId = await submitNewReport();
    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, false, {from: police1});
    // TODO: I have no idea why this isn't working
    /*
    Util.assertEvent({
      result: result,
      name: "PoliceReportSubmitted",
      args: (args) => {
        assert.equal(args.policeNode, police1);
        assert.equal(args.requestId.toNumber(), currentId);
        assert.equal(args.reportState, Util.PoliceReportState.Valid);
      }
    });
    */
    // the police report state has been updated
    const police_report_state = await quantstamp_audit_police.verifiedReports(currentId);
    assert.equal(police_report_state, Util.PoliceReportState.Invalid);
  });


  it("should not allow an auditor to claim the reward after the policing period when report is marked invalid");
  it("should assign all police to a report if policeNodesPerReport == numPoliceNodes");
  it("should allow the owner to set policeNodesPerReport");
  it("should assign all police to a report if policeNodesPerReport > numPoliceNodes");
  it("should correctly move the next police pointer if that police node is removed");
  it("should properly rotate police assignments");
  it("the report should remain invalid even if a positive report is received after a negative report");
  it("should not allow the police to submit a report that they are not assigned");
  it("should remove expired assignments");

});

