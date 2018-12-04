const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');

const Util = require("./util.js");
const AuditState = Util.AuditState;


contract('QuantstampAudit2', function(accounts) {
  const owner = accounts[0];
  const admin = accounts[1];
  const requestor = accounts[2];
  const auditor = accounts[3];

  const requestorBudget = Util.toQsp(100000);

  let requestCounter = 1;
  let minAuditStake;

  let quantstamp_audit_data;
  let quantstamp_audit_multirequest_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_police;
  let quantstamp_audit;
  let quantstamp_token;
  let quantstamp_audit_token_escrow;

  beforeEach(async function () {
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_multirequest_data = await QuantstampAuditMultiRequestData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_police = await QuantstampAuditPolice.deployed();
    quantstamp_audit_token_escrow = await QuantstampAuditTokenEscrow.deployed();

    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_multirequest_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_report_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_police.addAddressToWhitelist(quantstamp_audit.address);

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(65), {from : requestor});
    // timeout requests
    await quantstamp_audit_data.setAuditTimeout(10000);
    // add QuantstampAudit to the whitelist of the escrow
    await quantstamp_audit_token_escrow.addAddressToWhitelist(quantstamp_audit.address);
    minAuditStake = await quantstamp_audit_token_escrow.minAuditStake();
    await Util.stakeAuditor(quantstamp_token, quantstamp_audit, auditor, minAuditStake, owner);
  });

  it("should audit the contract if the requestor pays", async function () {
    assert.isTrue((await Util.balanceOf(quantstamp_token, requestor)).eq(requestorBudget));
    // initially the contract has empty budget
    assert.isTrue((await Util.balanceOf(quantstamp_token, quantstamp_audit.address)).eq(0));
    const price = Util.toQsp(35);
    const ownerBalance = await Util.getEthBalance(owner);
    // request an audit
    requestCounter++;
    const result = await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor});
    const requestId = Util.extractRequestId(result);

    // verify the emitted event
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].event, "LogAuditRequested");
    // the audit contract should have only one payment
    assert.isTrue((await Util.balanceOf(quantstamp_token, quantstamp_audit.address)).eq(price));
    assert.equal(await quantstamp_audit.isAuditFinished(requestId), false);
  });

  it("should log incremented request id when auditing", async function () {
    const firstRequestUri = "http://www.quantstamp.com/contract01.sol";
    const secondRequestUri = "http://www.quantstamp.com/contract02.sol";
    const price = Util.toQsp(25);

    const firstAuditRequestResult = await quantstamp_audit.requestAudit(firstRequestUri, price, {from : requestor});
    assert.equal(firstAuditRequestResult.logs.length, 1);
    assert.equal(firstAuditRequestResult.logs[0].event, "LogAuditRequested");
    const firstRequestId = firstAuditRequestResult.logs[0].args.requestId.toNumber();

    const secondAuditRequestResult = await quantstamp_audit.requestAudit(secondRequestUri, price, {from : requestor});
    assert.equal(secondAuditRequestResult.logs.length, 1);
    assert.equal(secondAuditRequestResult.logs[0].event, "LogAuditRequested");
    assert.equal(secondAuditRequestResult.logs[0].args.requestId.toNumber(), firstRequestId + 1);
  });

  it("should revert if the user tries to request an audit with an insufficient token allowance", async function () {
    const requestUri = "http://www.quantstamp.com/contract05.sol";
    const price = (await Util.balanceOf(quantstamp_token, requestor));
    Util.assertTxFail(quantstamp_audit.requestAudit(requestUri, price, {from : requestor}));
  });

  it("should revert if the user tries to request an audit with an insufficient token balance", async function () {
    const requestUri = "http://www.quantstamp.com/contract06.sol";
    const price = Util.toQsp(10000000);
    Util.assertTxFail(quantstamp_audit.requestAudit(requestUri, price, {from : requestor}));
  });

  it("should log an error if payment is requested for a non-pending audit", async function () {
    const price = Util.toQsp(35);
    await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor});
    const requestResult = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = Util.extractRequestId(requestResult);
    const result = await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from : auditor});

    assert.equal(await quantstamp_audit.isAuditFinished(requestId), true);

    const result2 = await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from : auditor});
    assert.equal(result2.logs.length, 1);
    assert.equal(result2.logs[0].event, "LogReportSubmissionError_InvalidState");
    assert.equal(result2.logs[0].args.requestId.toNumber(), requestId);
    assert.equal(result2.logs[0].args.auditor, auditor);

    const bogusId = 123456;
    const result3 = await quantstamp_audit.submitReport(bogusId, AuditState.Completed, Util.emptyReport, {from : auditor});
    assert.equal(result3.logs.length, 1);
    assert.equal(result3.logs[0].event, "LogReportSubmissionError_InvalidState");
    assert.equal(result3.logs[0].args.requestId.toNumber(), bogusId);
    assert.equal(result3.logs[0].args.auditor, auditor);
  });
});
