const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');

const Util = require("./util.js");
const AuditState = Util.AuditState;


contract('QuantstampAudit_multirequest', function(accounts) {
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
  let quantstamp_audit_view;
  let quantstamp_token;

  async function emptyQueue() {
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
  }

  async function initialize() {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_multirequest_data = await QuantstampAuditMultiRequestData.deployed();
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

  describe("when a new multirequest comes", async function () {
    let multiRequestId = 0;
    const requestCount = 2;

    before(async function() {
      await initialize();
      assert(await quantstamp_audit_view.getQueueLength.call(), 0);
      multiRequestId = Util.extractMultirequestId(
        await quantstamp_audit.multiRequestAudit(Util.uri, price, requestCount, {from:requestor}));
    });

    it("should make sure there is enough QSP is approved to be transferred", async function() {
      const approvedRequestorBudget = requestCount * price - 1;
      await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(approvedRequestorBudget), {from : requestor});
      Util.assertTxFail(quantstamp_audit.multiRequestAudit(Util.uri, Util.toQsp(price), requestCount, {from:requestor}));
      // restore aproval
      await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(approvalAmount), {from : requestor});
    });

    it("increases the queue size", async function() {
      assert(await quantstamp_audit_view.getQueueLength.call(), 2);
    });

    it("and makes requests accessible from the multiRequestId", async function() {
      const requestIds = await quantstamp_audit.multiRequestIdToRequestIds(multiRequestId);
      for(let i = 1; i < requestCount; ++i) {
        const requestId1 = requestIds[i-1].toNumber();
        const requestId2 = requestIds[i].toNumber();
        assert.equal(await quantstamp_audit_data.getAuditContractUri(requestId1),
          await quantstamp_audit_data.getAuditContractUri(requestId2));
        assert.equal((await quantstamp_audit_data.getAuditPrice(requestId1)).toNumber(),
          (await quantstamp_audit_data.getAuditPrice(requestId2)).toNumber());
      }
    });

    it("and returns empty array for a multiRequestId not added to the contract", async function() {
      const requestIds = await quantstamp_audit.multiRequestIdToRequestIds(multiRequestId * 10000);
      assert.equal(requestIds.length, 0)
    });

    it("and does not assign more than one request forked from a multirequest to an auditor", async function() {
      await quantstamp_audit.getNextAuditRequest({from: auditor});
      Util.assertEvent({
        result: await quantstamp_audit.getNextAuditRequest({from: auditor}),
        name: "LogAuditNodePriceHigherThanRequests",
        args: (args) => {}
      });
    });

    it("also allows another auditor take a different audit", async function() {
      const auditor2 = accounts[4];
      await quantstamp_audit_data.addNodeToWhitelist(auditor2);
      Util.assertEventAtIndex({
        result: await quantstamp_audit.getNextAuditRequest({from: auditor2}),
        name: "LogAuditAssigned",
        args: (args) => {},
        index: 1
      });
      await quantstamp_audit_data.removeNodeFromWhitelist(auditor2);

      assert(await quantstamp_audit_view.getQueueLength.call(), 0);
    });

    after(async function() {
      await emptyQueue();
    });
  });

  describe("when an auditor audited a request forked from a multirequest", async function() {
    before(async function() {
      await initialize();
      assert(await quantstamp_audit_view.getQueueLength.call(), 0);
    });

    it("skips other requests forked from the same multirequest", async function() {
      const requestCount = 2;
      await quantstamp_audit.multiRequestAudit(Util.uri, price, requestCount, {from:requestor});
      const uri2 = Util.uri + '-';
      await quantstamp_audit.requestAudit(uri2, price, {from:requestor});

      await quantstamp_audit.getNextAuditRequest({from: auditor});

      const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
      const requestId = Util.extractRequestId(result);
      assert(await quantstamp_audit_data.getAuditContractUri(requestId), uri2);
    });

    describe("and when a requests forked from multirequests in the last bucket are processed", async function() {
      before(async function() {
        assert(await quantstamp_audit_view.getQueueLength.call(), 1);
      });

      it("picks a request from another price bucket", async function() {
        const requestCountBatch2 = 2;
        const uri2 = Util.uri + '-';
        await quantstamp_audit.multiRequestAudit(uri2, price, requestCountBatch2, {from:requestor});

        const uri3 = Util.uri + '-';
        const price2 = price - 1;
        await quantstamp_audit.requestAudit(uri3, price2, {from:requestor});

        const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
        const requestId = Util.extractRequestId(result);
        assert(await quantstamp_audit_data.getAuditContractUri(requestId), uri2);

        const result2 = await quantstamp_audit.getNextAuditRequest({from: auditor});
        const requestId2 = Util.extractRequestId(result2);
        assert(await quantstamp_audit_data.getAuditContractUri(requestId2), uri3);
      });
    });

    after(async function() {
      await emptyQueue();
    });
  });

});
