const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');
const Util = require("./util.js");
const AuditState = Util.AuditState;


contract('QuantstampAudit', function(accounts) {
  const owner = accounts[0];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  const maxAssignedRequests = 100;

  let requestCounter = 1;
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
    // timeout requests
    await quantstamp_audit_data.setAuditTimeout(10000);
    // relaxing the requirement for other tests
    await quantstamp_audit_data.setMaxAssignedRequests(maxAssignedRequests);
  });

  afterEach(async function () {
    assert.isBelow((await quantstamp_audit_view.getQueueLength.call()), 5, "Queue size should not be more than 5 due to" +
      "limited generated accounts. Otherwise, generate more accounts in Ganache");
    for(let i = 9; i > 5 && (await quantstamp_audit_view.getQueueLength.call()) > 0; --i) {
      const auditorTmp = accounts[i];
      await quantstamp_audit_data.addNodeToWhitelist(auditorTmp);
      assert.equal((await quantstamp_audit.assignedRequestCount.call(auditorTmp)).toNumber(), 0);
      const result = await quantstamp_audit.getNextAuditRequest({from: auditorTmp});
      const requestId = Util.extractRequestId(result);
      await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.sha256emptyFile, {from: auditorTmp});
      await quantstamp_audit_data.removeNodeFromWhitelist(auditorTmp);
    }

  });

  it("queue size increases after a multirequest", async function() {
    assert(await quantstamp_audit_view.getQueueLength.call(), 0);
    const requestCount = 2;
    await quantstamp_audit.multiRequestAudit(Util.uri, price, requestCount, {from:requestor});
    assert(await quantstamp_audit_view.getQueueLength.call(), 2);
  });

});
