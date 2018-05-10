const Util = require("./util.js");
const QuantstampToken = artifacts.require('test/QuantstampToken');
const QuantstampAudit = artifacts.require('QuantstampAudit');

const AuditState = Object.freeze({
  None : 0,
  Queued : 1,
  Assigned : 2,
  Refunded : 3,
  Completed : 4,
  Error : 5
});

contract('QuantstampAudit2', function(accounts) {
  const owner = accounts[0];
  const admin = accounts[1];
  const requestor = accounts[2];
  const auditor = accounts[3];

  const requestorBudget = Util.toQsp(100000);
  const uri = "http://www.quantstamp.com/contract.sol";
  // transaction fee that offsets the gas cost on QSP network
  const fee = Util.toEther(0.5);

  const reportUri = "http://www.quantstamp.com/report.md";
  const sha256emptyFile = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  let requestCounter = 1;


  let quantstamp_audit;
  let quantstamp_token;

  async function balanceOf (user) {
    return (await quantstamp_token.balanceOf(user)).toNumber();
  }

  async function allowance (owner, spender) {
    return (await quantstamp_token.allowance(owner, spender)).toNumber();
  }

  async function getReportUri (requestId) {
    const reportUriIndex = 8;
    return (await quantstamp_audit.audits.call(requestId))[reportUriIndex];
  }

  async function getOwnerBalance () {
    return await web3.eth.getBalance(owner);
  }

  function extractRequestId(result) {
    return result.logs[0].args.requestId.toNumber();
  }

  function assertEvent({result, name, args}) {
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].event, name);
    args(result.logs[0].args);
  }

  function assertEventAtIndex({result, name, args, index}) {
    assert.equal(result.logs[index].event, name);
    args(result.logs[index].args);
  }


  beforeEach(async function () {
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit = await QuantstampAudit.deployed();
    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(65), {from : requestor});
    // whitelisting auditor
    await quantstamp_audit.addAddressToWhitelist(auditor);
  });

  it("should audit the contract if the requestor pays", async function () {
    assert.equal(await balanceOf(requestor), requestorBudget);
    // initially the contract has empty budget
    assert.equal(await balanceOf(quantstamp_audit.address), 0);
    await quantstamp_audit.setTransactionFee(fee, {from : owner});

    const price = Util.toQsp(35);
    const ownerBalance = await getOwnerBalance();
    // request an audit
    requestCounter++;
    const result = await quantstamp_audit.requestAudit(uri, price, {value : fee, from : requestor});
    const requestId = extractRequestId(result);

    // verify the emitted event
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].event, "LogAuditRequested");
    // the audit contract should have only one payment
    assert.equal(await balanceOf(quantstamp_audit.address), price);
    assert.equal(await quantstamp_audit.isAuditFinished(requestId), false);
    // owner should be paid the transaction fee
    assert.equal(ownerBalance.add(fee).toNumber(), (await getOwnerBalance()).toNumber());
  });

  it("should not audit unless the audit price is higher than the transaction fee", async function () {
    const newFee = Util.toEther(2);
    await quantstamp_audit.setTransactionFee(newFee, {from : owner});
    // verify that the new fee is set
    assert.equal((await quantstamp_audit.transactionFee.call()).toNumber(), newFee);

    // should fail, because fee < transactionFee
    requestCounter++;
    Util.assertTxFail(quantstamp_audit.requestAudit(uri, newFee, {value : fee, from : requestor}));
    // revert the transaction fee
    await quantstamp_audit.setTransactionFee(fee, {from : owner});
  });

  it("should pay the auditor for their work", async function () {
    await quantstamp_audit.setTransactionFee(fee, {from : owner});
    const price = Util.toQsp(35);
    requestCounter++;
    const result = await quantstamp_audit.requestAudit(uri, price, {value : fee, from : requestor});
    const requestId = extractRequestId(result);

    assertEventAtIndex({
      result: result,
      name: "LogAuditRequested",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId);
      },
      index: 0
    });

    const result2 = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId2 = extractRequestId(result2);
    assertEvent({
      result: result2,
      name: "LogAuditAssigned",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
        assert.equal(args.auditor, auditor);
      }
    });

    const result3 = await quantstamp_audit.submitReport(requestId2, AuditState.Completed, reportUri, sha256emptyFile, {from : auditor});

    assertEventAtIndex({
      result: result3,
      name: "LogAuditFinished",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), requestId2);
        assert.equal(args.auditor, auditor);
        assert.equal(args.auditResult, AuditState.Completed);
        assert.equal(args.reportUri, reportUri);
        assert.equal(args.reportHash, sha256emptyFile);
      },
      index: 0
    });

    assertEventAtIndex({
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
    assert.equal(await getReportUri(requestId2), reportUri);
    // all contract's tokens should be moved to the auditor's wallet
    assert.equal(await balanceOf(auditor), price);
  });

  it("should log incremented request id when auditing", async function () {
    const firstRequestUri = "http://www.quantstamp.com/contract01.sol";
    const secondRequestUri = "http://www.quantstamp.com/contract02.sol";
    const price = Util.toQsp(25);

    const firstAuditRequestResult = await quantstamp_audit.requestAudit(firstRequestUri, price, {value : fee, from : requestor});
    assert.equal(firstAuditRequestResult.logs.length, 1);
    assert.equal(firstAuditRequestResult.logs[0].event, "LogAuditRequested");
    const firstRequestId = firstAuditRequestResult.logs[0].args.requestId.toNumber();

    const secondAuditRequestResult = await quantstamp_audit.requestAudit(secondRequestUri, price, {value : fee, from : requestor});
    assert.equal(secondAuditRequestResult.logs.length, 1);
    assert.equal(secondAuditRequestResult.logs[0].event, "LogAuditRequested");
    assert.equal(secondAuditRequestResult.logs[0].args.requestId.toNumber(), firstRequestId + 1);
  });

  it("should log transaction fee and block timestamp when requesting audits", async function () {
    const requestUri = "http://www.quantstamp.com/contract03.sol";
    const price = Util.toQsp(25);

    const result = await quantstamp_audit.requestAudit(requestUri, price, {value : fee, from : requestor});
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].event, "LogAuditRequested");
    assert.equal(result.logs[0].args.transactionFee.toNumber(), fee);
    assert(result.logs[0].args.requestTimestamp.toNumber() > 0);
  });

  it("should log start and end timestamp when paying auditors", async function () {
    const requestUri = "http://www.quantstamp.com/contract04.sol";
    const price = Util.toQsp(25);
    const auditor = accounts[4];

    // whitelisting another auditor
    await quantstamp_audit.addAddressToWhitelist(auditor);

    const auditRequestResult = await quantstamp_audit.requestAudit(requestUri, price, {value : fee, from : requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = extractRequestId(result);

    const result2 = await quantstamp_audit.submitReport(requestId, AuditState.Completed, reportUri, sha256emptyFile, {from : auditor});
    assert.equal(await quantstamp_audit.isAuditFinished(requestId), true);
    assert.equal(await getReportUri(requestId), reportUri);
    assert.equal(result2.logs.length, 2);
    assert.equal(result2.logs[0].event, "LogAuditFinished");
    assert.equal(result2.logs[1].event, "LogPayAuditor");
    assert(result2.logs[0].args.reportTimestamp.toNumber() > 0);
  });

  it("should revert if the user tries to request an audit with an insufficient token allowance", async function () {
    const requestUri = "http://www.quantstamp.com/contract05.sol";
    const price = (await balanceOf(requestor));
    Util.assertTxFail(quantstamp_audit.requestAudit(requestUri, price, {value : fee, from : requestor}));
  });

  it("should revert if the user tries to request an audit with an insufficient token balance", async function () {
    const requestUri = "http://www.quantstamp.com/contract06.sol";
    const price = Util.toQsp(10000000);
    Util.assertTxFail(quantstamp_audit.requestAudit(requestUri, price, {value : fee, from : requestor}));
  });

  it("should log an error if payment is requested for a non-pending audit", async function () {
    const price = Util.toQsp(35);
    await quantstamp_audit.requestAudit(uri, price, {value : fee, from : requestor});
    const requestResult = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = extractRequestId(requestResult);
    const result = await quantstamp_audit.submitReport(requestId, AuditState.Completed, reportUri, sha256emptyFile, {from : auditor});

    assert.equal(await quantstamp_audit.isAuditFinished(requestId), true);

    const result2 = await quantstamp_audit.submitReport(requestId, AuditState.Completed, reportUri, sha256emptyFile, {from : auditor});
    assert.equal(await getReportUri(requestId), reportUri);
    assert.equal(result2.logs.length, 1);
    assert.equal(result2.logs[0].event, "LogReportSubmissionError_InvalidState");
    assert.equal(result2.logs[0].args.requestId.toNumber(), requestId);
    assert.equal(result2.logs[0].args.auditor, auditor);

    const bogusId = 123456;
    const result3 = await quantstamp_audit.submitReport(bogusId, AuditState.Completed, reportUri, sha256emptyFile, {from : auditor});
    assert.equal(await getReportUri(requestId), reportUri);
    assert.equal(result3.logs.length, 1);
    assert.equal(result3.logs[0].event, "LogReportSubmissionError_InvalidState");
    assert.equal(result3.logs[0].args.requestId.toNumber(), bogusId);
    assert.equal(result3.logs[0].args.auditor, auditor);
  });
});
