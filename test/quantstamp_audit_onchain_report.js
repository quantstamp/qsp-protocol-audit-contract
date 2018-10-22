const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');

const Util = require("./util.js");
const AuditState = Util.AuditState;


contract('QuantstampAudit_report', function(accounts) {
  const owner = accounts[0];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  const maxAssignedRequests = 100;
  const approvalAmount = 1000;

  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_multirequest_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_view;
  let quantstamp_token;

  async function initialize() {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_multirequest_data = await QuantstampAuditMultiRequestData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    quantstamp_token = await QuantstampToken.deployed();

    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_multirequest_data.addAddressToWhitelist(quantstamp_audit.address);

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(approvalAmount), {from : requestor});
    // whitelisting auditor
    await quantstamp_audit_data.addNodeToWhitelist(auditor);
    // timeout requests
    await quantstamp_audit_data.setAuditTimeout(10000);
    // relaxing the requirement for other tests
    await quantstamp_audit_data.setMaxAssignedRequests(maxAssignedRequests);
  }

  describe("when a an audit node submits report", async function () {

    let requestId;
    // two bytes
    const submittedReport = 0xFFAB;

    before(async function() {
      await initialize();
      await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
      const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
      requestId = Util.extractRequestId(result);
    });

    it("QuantstampAuditReportData should not let QuantstampAudit submits a report,", async function() {
      Util.assertTxFail(quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.sha256emptyFile, submittedReport, {from: auditor}));
    });

    it("unless QuantstampAudit is whitelisted in QuantstampAuditReportData,", async function() {
      await quantstamp_audit_report_data.addAddressToWhitelist(quantstamp_audit.address);

      Util.assertEventAtIndex({
        result: await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.sha256emptyFile, submittedReport, {from: auditor}),
        name: "LogAuditFinished",
        args: (args) => {},
        index: 0
      });
    });

    it("then the report is stored properly", async function() {
      assert.equal(parseInt(await quantstamp_audit_report_data.getReport(requestId)), submittedReport);
    });

  });
});
