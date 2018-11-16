const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');

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
  const police4 = accounts[7];
  let all_police = [police1, police2, police3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  const maxAssignedRequests = 100;
  const approvalAmount = 1000;
  const audit_timeout = 10;
  const police_timeout = 15;
  let currentId;
  let policeNodesPerReport;

  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_multirequest_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_view;
  let quantstamp_token;
  let quantstamp_audit_police;
  let quantstamp_audit_token_escrow;

  async function initialize() {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_multirequest_data = await QuantstampAuditMultiRequestData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_police = await QuantstampAuditPolice.deployed();
    quantstamp_audit_token_escrow = await QuantstampAuditTokenEscrow.deployed();

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
    // add QuantstampAudit to the whitelist of the escrow
    await quantstamp_audit_token_escrow.addAddressToWhitelist(quantstamp_audit.address);
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

  it("should not allow an auditor to claim a reward twice", async function() {
    await Util.assertTxFail(quantstamp_audit.claimAuditReward(currentId, {from: auditor}));
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
    const balance_before = await Util.balanceOf(quantstamp_token, auditor);
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
    const balance_after = await Util.balanceOf(quantstamp_token, auditor);
    assert.equal(balance_before + price, balance_after);
  });

  it("should allow the police to submit a negative report", async function() {
    currentId = await submitNewReport();

    // check that the report is not currently in the map
    const existing_report = await quantstamp_audit_police.getPoliceReport(currentId, police1);
    assert.equal(existing_report, Util.emptyReportStr);

    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, false, {from: police1});

    Util.assertNestedEvent({
      result: result,
      name: "PoliceReportSubmitted",
      args: (args) => {
        assert.equal(args.policeNode, police1);
        assert.equal(args.requestId, currentId);
        assert.equal(args.reportState, Util.PoliceReportState.Invalid);
      }
    });

    // the police report state has been updated
    const police_report_state = await quantstamp_audit_police.verifiedReports(currentId);
    assert.equal(police_report_state, Util.PoliceReportState.Invalid);

    // check that the report is added to the map
    const report = await quantstamp_audit_police.getPoliceReport(currentId, police1);
    assert.equal(report, Util.nonEmptyReport);
  });

  it("the report should remain invalid even if a positive report is received after a negative report", async function() {
    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: police2});

    // the police report should not be updated
    const police_report_state = await quantstamp_audit_police.verifiedReports(currentId);
    assert.equal(police_report_state, Util.PoliceReportState.Invalid);
  });


  it("should not allow an auditor to claim the reward after the policing period when report is marked invalid", async function() {
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);
    await Util.assertTxFail(quantstamp_audit.claimAuditReward(currentId, {from: auditor}));
  });

  it("should assign all police to a report if policeNodesPerReport == numPoliceNodes", async function() {
    currentId = await submitNewReport();
    let result;
    for(var i = 0; i < all_police.length; i++) {
      result = await quantstamp_audit_police.isAssigned(currentId, all_police[i]);
      assert.isTrue(result);
    }
  });

  it("should allow the owner to set policeNodesPerReport", async function() {
    policeNodesPerReport = 5;
    await Util.assertTxFail(quantstamp_audit_police.setPoliceNodesPerReport(policeNodesPerReport + 1, {from: requestor}));
    await quantstamp_audit_police.setPoliceNodesPerReport(policeNodesPerReport, {from: owner});
    const result = await quantstamp_audit_police.policeNodesPerReport();
    assert.equal(result, policeNodesPerReport);
  });

  it("should assign all police to a report if policeNodesPerReport > numPoliceNodes", async function() {
    currentId = await submitNewReport();
    let result;
    for(var i = 0; i < all_police.length; i++) {
      result = await quantstamp_audit_police.isAssigned(currentId, all_police[i]);
      assert.isTrue(result);
    }
  });

  it("should only assign some police to a report if policeNodesPerReport < numPoliceNodes", async function() {
    policeNodesPerReport = 2;
    await quantstamp_audit_police.setPoliceNodesPerReport(policeNodesPerReport, {from: owner});
    currentId = await submitNewReport();
    let result;
    // only the first 2 police will be assigned the report
    let expected_results = [true, true, false];
    for(var i = 0; i < all_police.length; i++) {
      result = await quantstamp_audit_police.isAssigned(currentId, all_police[i]);
      assert.equal(result, expected_results[i]);
    }
  });

  it("should properly rotate police assignments", async function() {
    currentId = await submitNewReport();
    let result;
    let expected_results = [true, false, true];
    for(var i = 0; i < all_police.length; i++) {
      result = await quantstamp_audit_police.isAssigned(currentId, all_police[i]);
      assert.equal(result, expected_results[i]);
    }
    currentId = await submitNewReport();
    expected_results = [false, true, true];
    for(var i = 0; i < all_police.length; i++) {
      result = await quantstamp_audit_police.isAssigned(currentId, all_police[i]);
      assert.equal(result, expected_results[i]);
    }
  });

  it("should correctly assign police reports if the last assigned police pointer is removed", async function() {
    // lastAssignedPoliceNode points to police3
    let result = await quantstamp_audit_police.removePoliceNode(police3, {from: owner});
    Util.assertNestedEvent({
      result: result,
      name: "PoliceNodeRemoved",
      args: (args) => {
        assert.equal(args.addr, police3);
      }
    });

    all_police = [police1, police2];
    assert.equal(await quantstamp_audit_police.numPoliceNodes(), 2);

    currentId = await submitNewReport();
    let expected_results = [true, true];
    for(var i = 0; i < all_police.length; i++) {
      result = await quantstamp_audit_police.isAssigned(currentId, all_police[i]);
      assert.equal(result, expected_results[i]);
    }
  });

  it("should correctly assign police reports if new police nodes are added", async function() {
    let result = await quantstamp_audit_police.addPoliceNode(police4, {from: owner});
    Util.assertNestedEvent({
      result: result,
      name: "PoliceNodeAdded",
      args: (args) => {
        assert.equal(args.addr, police4);
      }
    });
    all_police = [police1, police2, police4];

    policeNodesPerReport = 1;
    await quantstamp_audit_police.setPoliceNodesPerReport(policeNodesPerReport, {from: owner});

    currentId = await submitNewReport();
    let expected_results = [false, false, true];
    for(var i = 0; i < all_police.length; i++) {
      result = await quantstamp_audit_police.isAssigned(currentId, all_police[i]);
      assert.equal(result, expected_results[i]);
    }
  });

  it("should not allow the police to submit a report that they are not assigned", async function() {
    await Util.assertTxFail(quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: police1}));
  });

  it("getNextPoliceAssignment should remove expired assignments and return (false, 0) if no assignments are available", async function() {
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);
    const result = await quantstamp_audit.getNextPoliceAssignment({from: police1});
    assert.isTrue(!result[0]);
    assert.equal(result[1], 0);
  });

  it("should remove submitted assignments", async function() {
    policeNodesPerReport = 3;
    await quantstamp_audit_police.setPoliceNodesPerReport(policeNodesPerReport, {from: owner});

    // submit 2 reports that get assigned to all police nodes
    currentId = await submitNewReport();
    let currentId2 = await submitNewReport();
    let result = await quantstamp_audit.getNextPoliceAssignment({from: police1});
    assert.isTrue(result[0]);
    assert.equal(result[1], currentId);
    await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: police1});

    result = await quantstamp_audit.getNextPoliceAssignment({from: police1});
    assert.isTrue(result[0]);
    assert.equal(result[1], currentId2);
    await quantstamp_audit.submitPoliceReport(currentId2, Util.nonEmptyReport, true, {from: police1});

    result = await quantstamp_audit.getNextPoliceAssignment({from: police1});
    assert.isTrue(!result[0]);
    assert.equal(result[1], 0);
  });

  it("attempting to remove a non-police node should not decrement the police count", async function() {
    const num_police_before = await quantstamp_audit_police.numPoliceNodes();
    // requestor is not in the police
    await quantstamp_audit_police.removePoliceNode(requestor);
    const num_police_after = await quantstamp_audit_police.numPoliceNodes();
    assert.equal(num_police_before.toNumber(), num_police_after.toNumber());
  });

  it("attempting to add an existing police node should not increment the police count", async function() {
    const num_police_before = await quantstamp_audit_police.numPoliceNodes();
    await quantstamp_audit_police.addPoliceNode(all_police[0]);
    const num_police_after = await quantstamp_audit_police.numPoliceNodes();
    assert.equal(num_police_before.toNumber(), num_police_after.toNumber());
  });


  it("should allow auditors to submit reports even if there are no whitelisted police", async function() {
    for(var i = 0; i < all_police.length; i++) {
      await quantstamp_audit_police.removePoliceNode(all_police[i]);
    }
    all_police = [];
    assert.equal(await quantstamp_audit_police.numPoliceNodes(), 0);
    const balance_before = await Util.balanceOf(quantstamp_token, auditor);

    currentId = await submitNewReport();
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);

    await quantstamp_audit.claimAuditReward(currentId, {from: auditor});

    const balance_after = await Util.balanceOf(quantstamp_token, auditor);
    assert.equal(balance_before + price, balance_after);
  });

  it("should not allow auditors to claim rewards for reports not marked completed", async function() {
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = Util.extractRequestId(result);
    await quantstamp_audit.submitReport(requestId, AuditState.Error, Util.emptyReport, {from : auditor});
    Util.assertTxFail(quantstamp_audit.claimAuditReward(currentId, {from: auditor}));
  });
});

