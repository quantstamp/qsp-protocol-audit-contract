const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');


const Util = require("./util.js");
const AuditState = Util.AuditState;

contract('QuantstampAudit_resolution', function(accounts) {
  const owner = accounts[0];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const requestorBudget = Util.toQsp(100000);

  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_multirequest_data;
  let quantstamp_audit_report_data;
  let quantstamp_token;

  beforeEach(async function () {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_multirequest_data = await QuantstampAuditMultiRequestData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_token = await QuantstampToken.deployed();

    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_multirequest_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_report_data.addAddressToWhitelist(quantstamp_audit.address);

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(1000), {from : requestor});
    // whitelisting auditor
    await quantstamp_audit_data.addNodeToWhitelist(auditor);
    // allow audit nodes to perform many audits at once
    await quantstamp_audit_data.setMaxAssignedRequests(1000);
    // timeout requests
    await quantstamp_audit_data.setAuditTimeout(10000);
  });

  it("should not pay the audit node for an error report", async function () {
    const price = Util.toQsp(35);
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const requestId = Util.extractRequestId(result);
    const balanceOfAuditorBeforeAudit = await Util.balanceOf(quantstamp_token, auditor);
    await quantstamp_audit.getNextAuditRequest({from:auditor});

    Util.assertEvent({
      result: await quantstamp_audit.submitReport(requestId, AuditState.Error, Util.reportUri, Util.sha256emptyFile, Util.emptyReport, {from: auditor}),
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId, requestId);
        assert.equal(args.auditResult, AuditState.Error);
      }
    });

    assert.equal(await Util.balanceOf(quantstamp_token, auditor), balanceOfAuditorBeforeAudit);
  });

  it("should resolve an error report in favor of the auditor given owner's wish", async function () {
    const price = Util.toQsp(35);
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const requestId = Util.extractRequestId(result);
    const balanceOfAuditorBeforeAudit = await Util.balanceOf(quantstamp_token, auditor);
    const balanceOfRequesterBeforeAudit = await Util.balanceOf(quantstamp_token, requestor);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await quantstamp_audit.submitReport(requestId, AuditState.Error, Util.reportUri, Util.sha256emptyFile, Util.emptyReport, {from: auditor});
    assert.equal(await Util.balanceOf(quantstamp_token, auditor), balanceOfAuditorBeforeAudit);

    Util.assertEvent({
      result: await quantstamp_audit.resolveErrorReport(requestId, false),
      name: "LogErrorReportResolved",
      args: (args) => {
        assert.equal(args.requestId, requestId);
        assert.equal(args.receiver, auditor);
        assert.equal(args.auditPrice, price);
      }
    });

    assert.equal(await Util.balanceOf(quantstamp_token, auditor), balanceOfAuditorBeforeAudit + price);
    assert.equal(await Util.balanceOf(quantstamp_token, requestor), balanceOfRequesterBeforeAudit);
  });

  it("should resolve an error report in favor of the requester given owner's wish", async function () {
    const price = Util.toQsp(35);
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const requestId = Util.extractRequestId(result);
    const balanceOfAuditorBeforeAudit = await Util.balanceOf(quantstamp_token, auditor);
    const balanceOfRequesterBeforeAudit = await await quantstamp_token.balanceOf(requestor);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await quantstamp_audit.submitReport(requestId, AuditState.Error, Util.reportUri, Util.sha256emptyFile, Util.emptyReport, {from: auditor});
    assert.equal(await Util.balanceOf(quantstamp_token, auditor), balanceOfAuditorBeforeAudit);

    Util.assertEvent({
      result: await quantstamp_audit.resolveErrorReport(requestId, true),
      name: "LogErrorReportResolved",
      args: (args) => {
        assert.equal(args.requestId, requestId);
        assert.equal(args.receiver, requestor);
        assert.equal(args.auditPrice, price);
      }
    });

    assert.equal(await Util.balanceOf(quantstamp_token, auditor), balanceOfAuditorBeforeAudit);
    assert.equal(await Util.balanceOf(quantstamp_token, requestor), balanceOfRequesterBeforeAudit.add(price));
  });

  it("should not resolve a request without an error status", async function () {
    const price = Util.toQsp(35);
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const requestId = Util.extractRequestId(result);
    const balanceOfAuditorBeforeAudit = await quantstamp_token.balanceOf(auditor);
    const balanceOfRequesterBeforeAudit = await Util.balanceOf(quantstamp_token, requestor);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.reportUri, Util.sha256emptyFile, Util.emptyReport, {from: auditor});
    assert.equal(await Util.balanceOf(quantstamp_token, auditor), balanceOfAuditorBeforeAudit.add(price));

    Util.assertEvent({
      result: await quantstamp_audit.resolveErrorReport(requestId, true),
      name: "LogInvalidResolutionCall",
      args: (args) => {
        assert.equal(args.requestId, requestId);
      }
    });

    assert.equal(await Util.balanceOf(quantstamp_token, auditor), balanceOfAuditorBeforeAudit.add(price));
    assert.equal(await Util.balanceOf(quantstamp_token, requestor), balanceOfRequesterBeforeAudit);
  });

  it("should not re-resolve an error report", async function () {
    const price = Util.toQsp(35);
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const requestId = Util.extractRequestId(result);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    await quantstamp_audit.submitReport(requestId, AuditState.Error, Util.reportUri, Util.sha256emptyFile, Util.emptyReport, {from: auditor});

    Util.assertEvent({
      result: await quantstamp_audit.resolveErrorReport(requestId, true),
      name: "LogErrorReportResolved",
      args: (args) => {
        assert.equal(args.requestId, requestId);
        assert.equal(args.receiver, requestor);
        assert.equal(args.auditPrice, price);
      }
    });

    Util.assertEvent({
      result: await quantstamp_audit.resolveErrorReport(requestId, true),
      name: "LogInvalidResolutionCall",
      args: (args) => {
        assert.equal(args.requestId, requestId);
      }
    });
  });
});
