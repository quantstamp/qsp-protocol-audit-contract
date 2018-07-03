const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const Util = require("./util.js");
const AuditState = Util.AuditState;

contract('QuantstampAudit_expires', function(accounts) {
  const owner = accounts[0];
  const admin = accounts[1];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);

  let globalRequestId = 0;
  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_view;
  let quantstamp_token;

  beforeEach(async function () {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();

    quantstamp_token = await QuantstampToken.deployed();
    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
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

  it("should adjust expired requests in each call for bidding request", async function () {
    const timeout = 10;
    await quantstamp_audit_data.setAuditTimeout(timeout);
    const requestedId = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));

    Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from:auditor}));
    await Util.mineNBlocks(timeout-2);

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

  it("should update the assigned queue and states accordingly", async function () {
    // do white box testing for increasing coverage
    const timeout = 10;
    await quantstamp_audit_data.setAuditTimeout(timeout);
    const requestedId1 = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price, {from : requestor}));
    const requestedId2 = Util.extractRequestId(await quantstamp_audit.requestAudit(Util.uri, price + 1, {from : requestor}));

    Util.extractRequestId(await quantstamp_audit.getNextAuditRequest({from:auditor}));
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), requestedId2);
    await Util.mineNBlocks(timeout - 1);
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), requestedId2);
    await quantstamp_audit.getNextAuditRequest({from:auditor});
    assert.equal((await quantstamp_audit.getNextAssignedRequest(0)).toNumber(), requestedId1);
    assert.equal((await quantstamp_audit_data.getAuditState(requestedId2)).toNumber(), Util.AuditState.Expired);
  });

  it("should adjust expired requests in each report submission happening after time allowance", async function () {
  });

  it("should not allow audit to submit after time allowance", async function () {
  });

  it("should not leave a request in the assigned queue after a refund", async function () {
  });
});
