const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditMultiRequestData = artifacts.require('QuantstampAuditMultiRequestData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');
const Util = require("./util.js");
const AuditState = Util.AuditState;


contract('QuantstampAudit', function(accounts) {
  const owner = accounts[0];
  const admin = accounts[1];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  const maxAssignedRequests = 100;

  let requestCounter = 1;
  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_multirequest_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_view;
  let quantstamp_token;
  let quantstamp_audit_token_escrow;
  let min_stake;

  beforeEach(async function () {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_multirequest_data = await QuantstampAuditMultiRequestData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_token_escrow = await QuantstampAuditTokenEscrow.deployed();

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
    // relaxing the requirement for other tests
    await quantstamp_audit_data.setMaxAssignedRequests(maxAssignedRequests);
    // add QuantstampAudit to the whitelist of the escrow
    await quantstamp_audit_token_escrow.addAddressToWhitelist(quantstamp_audit.address);
    // get the minimum stake needed to be an auditor
    min_stake = await quantstamp_audit.getMinAuditStake();
  });

  it("anyRequestAvailable should return understaked if not staked", async function() {
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const result = await quantstamp_audit.anyRequestAvailable({from: auditor});
    assert.equal(result.toNumber(), Util.AuditAvailabilityState.Understaked);
  });

  it("should not be able to get an audit if not staked", async function() {
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    Util.assertEvent({
      result: result,
      name: "LogAuditAssignmentError_Understaked",
      args: (args) => {
        assert.equal(args.auditor, auditor);
        assert.equal(args.stake, 0);
      }
    });
  });

  it("should allow auditors to stake tokens", async function() {
    // transfer min_stake QSP tokens to the auditor
    await quantstamp_token.transfer(auditor, min_stake, {from : owner});
    // approve the audit contract to use up to min_stake for staking
    await quantstamp_token.approve(quantstamp_audit.address, min_stake, {from : auditor});
    // the auditor stakes enough tokens
    await quantstamp_audit.stake(min_stake, {from : auditor});
    const result = await quantstamp_audit.anyRequestAvailable({from: auditor});
    assert.isTrue(await quantstamp_audit.didStakeEnough({from: auditor}));
    assert.equal(result.toNumber(), Util.AuditAvailabilityState.Ready);
    assert.equal(min_stake, (await quantstamp_audit.totalStakedFor(auditor)).toNumber());
  });

  it("should allow auditors to unstake tokens", async function() {
    const balance_before = await Util.balanceOf(quantstamp_token, auditor);
    await quantstamp_audit.unstake({from : auditor});
    const balance_after = await Util.balanceOf(quantstamp_token, auditor);
    assert.equal(balance_before + min_stake, balance_after);
    assert.equal(0, await quantstamp_audit.totalStakedFor(auditor));
  });

  it("should be understaked if the stake was not large enough", async function() {
    // transfer min_stake QSP tokens to the auditor
    const insufficient_stake = min_stake.minus(1);
    await quantstamp_token.transfer(auditor, insufficient_stake, {from : owner});
    // approve the audit contract to use up to min_stake for staking
    await quantstamp_token.approve(quantstamp_audit.address, insufficient_stake, {from : auditor});
    // the auditor stakes enough tokens
    await quantstamp_audit.stake(insufficient_stake, {from : auditor});
    const result = await quantstamp_audit.anyRequestAvailable({from: auditor});
    assert.equal(result.toNumber(), Util.AuditAvailabilityState.Understaked);
  });

  it("should be sufficiently staked from two smaller stakes", async function() {
    // transfer min_stake QSP tokens to the auditor
    const insufficient_stake = 1;
    await quantstamp_token.transfer(auditor, insufficient_stake, {from : owner});
    // approve the audit contract to use up to min_stake for staking
    await quantstamp_token.approve(quantstamp_audit.address, insufficient_stake, {from : auditor});
    // the auditor stakes enough tokens
    await quantstamp_audit.stake(insufficient_stake, {from : auditor});
    const result = await quantstamp_audit.anyRequestAvailable({from: auditor});
    assert.equal(result.toNumber(), Util.AuditAvailabilityState.Ready);
  });

  it("should be able to get an audit if staked", async function() {
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    await Util.assertEvent({
      result: result,
      name: "LogAuditAssigned",
      args: (args) => {}
    });
  });

  it("funds should be locked after receiving an audit assignment", async function() {
    await Util.assertTxFail(quantstamp_audit.unstake({from : auditor}));
  });


  it("funds should be unlocked after the lock period ends", async function() {
    // TODO (QSP-806): this amount must include the policing period
    const lock_period_length = (await quantstamp_audit_data.auditTimeoutInBlocks()).toNumber() + 1;
    await Util.mineNBlocks(lock_period_length);
    await quantstamp_audit.unstake({from : auditor});
    assert.equal(0, await quantstamp_audit.totalStakedFor(auditor));
  });



});
