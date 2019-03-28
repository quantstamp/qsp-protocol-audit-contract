const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampAuditData = artifacts.require('QuantstampAuditData');
const QuantstampAuditReportData = artifacts.require('QuantstampAuditReportData');
const QuantstampAuditView = artifacts.require('QuantstampAuditView');
const QuantstampToken = artifacts.require('QuantstampToken');
const QuantstampAuditPolice = artifacts.require('QuantstampAuditPolice');
const QuantstampAuditTokenEscrow = artifacts.require('QuantstampAuditTokenEscrow');

const BigNumber = require('bignumber.js');
const BN = require('bn.js');
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
  let expectedAuditorPayment;
  let police_timeout = 15;
  let currentId;
  let policeNodesPerReport;
  let min_stake;
  let slash_percentage;
  let slash_amount;

  let quantstamp_audit;
  let quantstamp_audit_data;
  let quantstamp_audit_report_data;
  let quantstamp_audit_view;
  let quantstamp_token;
  let quantstamp_audit_police;
  let quantstamp_audit_token_escrow;

  async function initialize() {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_audit_data = await QuantstampAuditData.deployed();
    quantstamp_audit_report_data = await QuantstampAuditReportData.deployed();
    quantstamp_audit_view = await QuantstampAuditView.deployed();
    quantstamp_token = await QuantstampToken.deployed();
    quantstamp_audit_police = await QuantstampAuditPolice.deployed();
    quantstamp_audit_token_escrow = await QuantstampAuditTokenEscrow.deployed();

    // used to decode events in QuantstampAuditPolice
    abiDecoder.addABI(quantstamp_audit_police.abi);

    // used to decode events in QuantstampAuditTokenEscrow
    abiDecoder.addABI(quantstamp_audit_token_escrow.abi);

    await quantstamp_audit_view.setQuantstampAudit(quantstamp_audit.address);
    await quantstamp_audit_report_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_data.addAddressToWhitelist(quantstamp_audit.address);
    await quantstamp_audit_police.addAddressToWhitelist(quantstamp_audit.address);

    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // lower the audit timeout
    await quantstamp_audit_data.setAuditTimeout(audit_timeout);
    // add QuantstampAudit to the whitelist of the escrow
    await quantstamp_audit_token_escrow.addAddressToWhitelist(quantstamp_audit.address);
    // add QuantstampAuditPolice to the whitelist of the escrow for slashing
    await quantstamp_audit_token_escrow.addAddressToWhitelist(quantstamp_audit_police.address);
    // lower the police timeout
    await quantstamp_audit_police.setPoliceTimeoutInBlocks(police_timeout);
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(approvalAmount), {from : requestor});
    // relaxing the requirement for other tests
    await quantstamp_audit_data.setMaxAssignedRequests(maxAssignedRequests);
    // get the minimum stake needed to be an auditor
    min_stake = await quantstamp_audit.getMinAuditStake();
    // since the police now take a fee, the auditor payment no longer equals the price
    expectedAuditorPayment = new BN(price - await quantstamp_audit_police.getPoliceFee(price));
    // get the slash percentage and amount
    slash_percentage = await quantstamp_audit_police.slashPercentage();
    slash_amount = await quantstamp_audit_token_escrow.getSlashAmount(slash_percentage);
    // stake the auditor
    await stakeAuditor(min_stake);
  }

  async function stakeAuditor(amount) {
    // transfer min_stake QSP tokens to the auditor
    await quantstamp_token.transfer(auditor, amount, {from : owner});
    // approve the audit contract to use up to min_stake for staking
    await quantstamp_token.approve(quantstamp_audit.address, amount, {from : auditor});
    // the auditor stakes enough tokens
    await quantstamp_audit.stake(amount, {from : auditor});
    const result = await quantstamp_audit.anyRequestAvailable({from: auditor});
    assert.isTrue(await quantstamp_audit.hasEnoughStake(auditor, {from: auditor}));
  }

  // an audit is requested and a report is submitted
  async function submitNewReport() {
    let res = await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = Util.extractRequestId(result);
    await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from : auditor});
    return requestId;
  }

  async function getPoliceBalances() {
    var balance_list = [];
    for (var i = 0; i < all_police.length; i++) {
      balance_list.push(await Util.balanceOf(quantstamp_token, all_police[i]));
    }
    return balance_list;
  }

  // checks that the police balances are split correctly after payment
  async function checkPoliceBalances(previousBalances, payment) {
    // integerValue() and div() don't seem to work in BN, switching to BigNumber
    const paymentBigNum = new BigNumber(payment);
    const expectedIncrease = paymentBigNum.dividedBy(all_police.length).sub(paymentBigNum.dividedBy(all_police.length).mod(1))
    let balance;
    for (var i = 0; i < all_police.length; i++) {
      balance = await Util.balanceOf(quantstamp_token, all_police[i]);
      // the true balance might be slightly higher due to the remainder
      assert.isTrue(new BigNumber(previousBalances[i]).plus(expectedIncrease).lte(balance))
    }

  }


  before(async function() {
    await initialize();
    // add police to whitelist
    for(var i = 0; i < all_police.length; i++) {
      await quantstamp_audit_police.addPoliceNode(all_police[i]);
    }
  });

  it("should not be possible to deploy the police with bad constructor arguments", async function() {
    const non_zero_addr = accounts[9];
    await Util.assertTxFail(QuantstampAuditPolice.new(Util.zeroAddress, non_zero_addr));
    await Util.assertTxFail(QuantstampAuditPolice.new(non_zero_addr, Util.zeroAddress));
  });

  it("should correctly check whether the caller is in the police", async function() {
    assert.isTrue(!(await quantstamp_audit.isPoliceNode(auditor, {from: auditor})));
    assert.isTrue(await quantstamp_audit.isPoliceNode(police1, {from: police1}));
  });

  it("should not allow an auditor to claim the reward before the policing period finishes", async function() {
    currentId = await submitNewReport();
    await Util.assertTxFail(quantstamp_audit.claimRewards({from: auditor}));
  });

  it("should not allow a regular user to submit a police report", async function() {
    await Util.assertTxFail(quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: requestor}));
  });

  it("should not allow a non-auditor to claim the reward", async function() {
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);
    await Util.assertTxFail(quantstamp_audit.claimRewards({from: requestor}));
  });

  it("should not allow the police to submit a report after the police timeout", async function() {
    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: police1});
    Util.assertNestedEventAtIndex({
      result: result,
      name: "PoliceSubmissionPeriodExceeded",
      args: (args) => {
        assert.equal(args.requestId, currentId);
      },
      index: 1
    });

    // check that the report map is still empty
    const report = await quantstamp_audit_police.getPoliceReport(currentId, police1);
    assert.equal(report, Util.emptyReport);

  });

  it("should allow an auditor to claim the reward after the policing period when not verified", async function() {
    const police_report_state = await quantstamp_audit_police.verifiedReports(currentId);
    assert.equal(police_report_state, Util.PoliceReportState.Unverified);

    const result = await quantstamp_audit.claimRewards({from: auditor});
    Util.assertEvent({
      result: result,
      name: "LogPayAuditor",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), currentId);
        assert.equal(args.auditor, auditor);
        assert.isTrue(args.amount.eq(expectedAuditorPayment));
      }
    });
    assert.equal(await quantstamp_audit_police.verifiedReports(currentId), Util.PoliceReportState.Expired);
  });

  it("should not allow the police to submit a report after the police timeout with a larger assignment queue", async function() {
    let currentId1 = await submitNewReport();
    let currentId2 = await submitNewReport();
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);

    const result = await quantstamp_audit.submitPoliceReport(currentId2, Util.nonEmptyReport, true, {from: police1});
    Util.assertNestedEventAtIndex({
      result: result,
      name: "PoliceSubmissionPeriodExceeded",
      args: (args) => {
        assert.equal(args.requestId, currentId2);
      },
      index: 2
    });
    await quantstamp_audit.claimRewards({from: auditor});
  });



  it("should not allow an auditor to claim a reward twice", async function() {
    await Util.assertTxFail(quantstamp_audit.claimRewards({from: auditor}));
  });

  it("should allow the police to submit a positive report", async function() {
    currentId = await submitNewReport();
    assert.equal(await quantstamp_audit_police.getPoliceReportResult(currentId, police1), Util.PoliceReportState.Unverified);
    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: police1});

    Util.assertEvent({
      result: result,
      name: "LogPoliceAuditFinished",
      args: (args) => {
        assert.equal(args.policeNode, police1);
        assert.equal(args.requestId, currentId);
        assert.isTrue(args.isVerified);
        assert.equal(args.report, Util.nonEmptyReport);
      }
    });

    // the police report state has been updated
    const police_report_state = await quantstamp_audit_police.verifiedReports(currentId);
    assert.equal(police_report_state, Util.PoliceReportState.Valid);
    assert.equal(await quantstamp_audit_police.getPoliceReportResult(currentId, police1), Util.PoliceReportState.Valid);

    // check that the report is added to the map
    const report = await quantstamp_audit_police.getPoliceReport(currentId, police1);
    assert.equal(report, Util.nonEmptyReport);
  });

  it("should allow an auditor to claim the reward after the policing period when verified", async function() {
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);
    const balance_before = await Util.balanceOf(quantstamp_token, auditor);
    const result = await quantstamp_audit.claimRewards({from: auditor});
    Util.assertEvent({
      result: result,
      name: "LogPayAuditor",
      args: (args) => {
        assert.equal(args.requestId.toNumber(), currentId);
        assert.equal(args.auditor, auditor);
        assert.isTrue(args.amount.eq(expectedAuditorPayment));
      }
    });
    const balance_after = await Util.balanceOf(quantstamp_token, auditor);
    assert.isTrue(balance_before.plus(expectedAuditorPayment).eq(balance_after));
  });

  it("should allow the police to submit a negative report", async function() {
    currentId = await submitNewReport();

    // check that the report is not currently in the map
    const existing_report = await quantstamp_audit_police.getPoliceReport(currentId, police1);
    assert.equal(existing_report, Util.emptyReport);

    const auditor_deposits_before = await quantstamp_audit_token_escrow.depositsOf(auditor);
    const police_balances_before = await getPoliceBalances();

    assert.equal(await quantstamp_audit_police.getPoliceReportResult(currentId, police1), Util.PoliceReportState.Unverified);

    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, false, {from: police1});

    Util.assertNestedEventAtIndex({
      result: result,
      name: "Slashed",
      args: (args) => {
        assert.equal(args.addr, auditor.toLowerCase());
        assert.isTrue(slash_amount.eq(args.amount));
      },
      index: 0
    });

    Util.assertNestedEventAtIndex({
      result: result,
      name: "PoliceSlash",
      args: (args) => {
        assert.equal(args.requestId, currentId);
        assert.equal(args.policeNode, police1.toLowerCase());
        assert.equal(args.auditNode, auditor.toLowerCase());
        assert.isTrue(slash_amount.eq(args.amount));
      },
      index: 2
    });

    Util.assertEventAtIndex({
      result: result,
      name: "LogPoliceAuditFinished",
      args: (args) => {
        assert.equal(args.policeNode, police1);
        assert.equal(args.requestId, currentId);
        assert.isTrue(!args.isVerified);
        assert.equal(args.report, Util.nonEmptyReport);
      },
      index: 0
    });

    assert.equal(await quantstamp_audit_police.getPoliceReportResult(currentId, police1), Util.PoliceReportState.Invalid);

    const auditor_deposits_after = await quantstamp_audit_token_escrow.depositsOf(auditor);
    const police_balance_after = await Util.balanceOf(quantstamp_token, quantstamp_audit_police.address);

    // the auditor has been slashed a percentage of its stake
    assert.equal(auditor_deposits_before - slash_amount, auditor_deposits_after);
    // the police contract does not gain any tokens
    const expected_police_balance = 0;
    assert.equal(expected_police_balance, police_balance_after);

    // the police report state has been updated
    const police_report_state = await quantstamp_audit_police.verifiedReports(currentId);
    assert.equal(police_report_state, Util.PoliceReportState.Invalid);

    // check that the report is added to the map
    const report = await quantstamp_audit_police.getPoliceReport(currentId, police1);
    assert.equal(report, Util.nonEmptyReport);

    // check that the individual police gained QSP
    await checkPoliceBalances(police_balances_before, slash_amount.add(expectedAuditorPayment));

    // top up the stake of the auditor
    await stakeAuditor(slash_amount);
  });

  it("the report should remain invalid even if a positive report is received after a negative report", async function() {
    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: police2});

    // the police report should not be updated
    const police_report_state = await quantstamp_audit_police.verifiedReports(currentId);
    assert.isTrue(police_report_state.eq(Util.PoliceReportState.Invalid));
  });

/* this does not seem to be the expected behaviour - can anyone confirm?
  it("should not allow an auditor to claim the reward after the policing period when report is marked invalid", async function() {
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);
    await Util.assertTxFail(quantstamp_audit.claimRewards({from: auditor}));
  });
*/

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

  it("should be able to get all police assigned to a report", async function() {
    let result;
    result = await quantstamp_audit_police.getNextAssignedPolice(currentId, Util.zeroAddress);
    for(var i = 0; i < all_police.length; i++) {
      assert.isTrue(result[0]);
      assert.equal(result[1], all_police[i]);
      result = await quantstamp_audit_police.getNextAssignedPolice(currentId, all_police[i]);
    }
    assert.isTrue(!result[0]);
    assert.equal(result[1], 0);
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
        assert.equal(args.addr, police3.toLowerCase());
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
        assert.equal(args.addr, police4.toLowerCase());
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

  it("getNextPoliceAssignment should remove expired assignments and return (false, 0, 0, '', 0) if no assignments are available", async function() {
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);
    const result = await quantstamp_audit.getNextPoliceAssignment({from: police1});
    assert.isTrue(!result[0]);
    assert.equal(result[1], 0);
    assert.equal(result[2], 0);
    assert.equal(result[3], "");
    assert.equal(result[4], 0);
  });

  it("should remove submitted assignments", async function() {
    policeNodesPerReport = 3;
    await quantstamp_audit_police.setPoliceNodesPerReport(policeNodesPerReport, {from: owner});

    // submit 2 reports that get assigned to all police nodes
    currentId = await submitNewReport();
    let currentId2 = await submitNewReport();
    let result = await quantstamp_audit.getNextPoliceAssignment({from: police1});
    let expectedPoliceAssignmentBlockNumber = await quantstamp_audit_data.getAuditReportBlockNumber(currentId);
    let expectedPoliceAssignmentBlockNumber2 = await quantstamp_audit_data.getAuditReportBlockNumber(currentId2);

    assert.isTrue(result[0]);
    assert.equal(result[1], currentId);
    assert.equal(result[2], price);
    assert.equal(result[3], Util.uri);
    assert.isTrue(result[4].eq(expectedPoliceAssignmentBlockNumber));
    await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, true, {from: police1});

    result = await quantstamp_audit.getNextPoliceAssignment({from: police1});
    assert.isTrue(result[0]);
    assert.equal(result[1], currentId2);
    assert.equal(result[2], price);
    assert.equal(result[3], Util.uri);
    assert.isTrue(result[4].eq(expectedPoliceAssignmentBlockNumber2));
    await quantstamp_audit.submitPoliceReport(currentId2, Util.nonEmptyReport, true, {from: police1});

    result = await quantstamp_audit.getNextPoliceAssignment({from: police1});
    assert.isTrue(!result[0]);
    assert.equal(result[1], 0);
    assert.equal(result[2], 0);
    assert.equal(result[3], "");
    assert.equal(result[4], 0);
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
    const num_blocks = police_timeout + 1;

    // clear pending payments
    await Util.mineNBlocks(num_blocks);
    await quantstamp_audit.claimRewards({from: auditor});

    for(var i = 0; i < all_police.length; i++) {
      await quantstamp_audit_police.removePoliceNode(all_police[i]);
    }
    all_police = [];
    assert.equal(await quantstamp_audit_police.numPoliceNodes(), 0);
    const balance_before = await Util.balanceOf(quantstamp_token, auditor);

    currentId = await submitNewReport();
    await Util.mineNBlocks(num_blocks);

    await quantstamp_audit.claimRewards({from: auditor});

    const balance_after = await Util.balanceOf(quantstamp_token, auditor);
    // if there are no police, they should receive the full price
    assert.isTrue(balance_before.add(new BN(price)).eq(balance_after));
  });

  it("should not allow auditors to claim rewards for reports not marked completed", async function() {
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = Util.extractRequestId(result);
    await quantstamp_audit.submitReport(requestId, AuditState.Error, Util.emptyReport, {from : auditor});
    await Util.assertTxFail(quantstamp_audit.claimRewards({from: auditor}));
  });

  it("should allow auditors to claim multiple rewards at the same time", async function() {
    const num_reports = 5;
    for(var i = 0; i < num_reports; i++) {
      await submitNewReport();
    }
    const balance_before = await Util.balanceOf(quantstamp_token, auditor);

    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);

    await quantstamp_audit.claimRewards({from: auditor});

    const balance_after = await Util.balanceOf(quantstamp_token, auditor);
    assert.isTrue(balance_before.add(new BN(price * num_reports)).eq(balance_after));

  });

  it("should allow auditors to iteratively claim all rewards", async function() {
    const HEAD = 0;
    let currentId = HEAD;
    let result;
    const num_reports = 5;
    for(var i = 0; i < num_reports; i++) {
      await submitNewReport();
    }
    const balance_before = await Util.balanceOf(quantstamp_token, auditor);

    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);

    // check that we can find all report IDs in the list
    for(let i = 0; i < num_reports; i++) {
      result = await quantstamp_audit.getNextAvailableReward(currentId, {from: auditor});
      assert.isTrue(result[0]);
      currentId = result[1];
    }
    result = await quantstamp_audit.getNextAvailableReward(currentId, {from: auditor});
    assert.isTrue(!result[0]);
    assert.equal(result[1], 0);

    for(let i = 0; i < num_reports; i++) {
      result = await quantstamp_audit.getNextAvailableReward(HEAD, {from: auditor});
      assert.isTrue(result[0]);
      await quantstamp_audit.claimReward(result[1], {from: auditor});
      currentId = result[1];
    }
    result = await quantstamp_audit.getNextAvailableReward(HEAD, {from: auditor});
    assert.isTrue(!result[0]);
    assert.equal(result[1], 0);

    const balance_after = await Util.balanceOf(quantstamp_token, auditor);
    assert.isTrue(balance_before.add(new BN(price * num_reports)).eq(balance_after));

  });

  it("should allow auditors to claim many rewards with multiple calls", async function() {
    let balance_before;
    let balance_after;
    let result;
    let hasRewards;
    let loopIterations = 0;
    const num_reports = 10;
    for(var i = 0; i < num_reports; i++) {
      await submitNewReport();
    }
    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);

    balance_before = await Util.balanceOf(quantstamp_token, auditor);

    while(true) {
      loopIterations = loopIterations + 1;

      // changing the gas to speed up the test suite, otherwise we'd need to submit around 50 reports
      result = await quantstamp_audit.claimRewards({from: auditor, gas: 1000000});

      // check that LogClaimRewardsReachedGasLimit was emitted in the first call
      if (loopIterations == 1) {
        assert.equal(result.logs[result.logs.length - 1]["event"], "LogClaimRewardsReachedGasLimit");
      }

      hasRewards = await quantstamp_audit.hasAvailableRewards({from: auditor});
      if (!hasRewards) {
        break;
      }
    }

    balance_after = await Util.balanceOf(quantstamp_token, auditor);
    assert.isTrue(balance_before.add(new BN(price * num_reports)).eq(balance_after));
    assert.isTrue(loopIterations >= 2);
  });

  it("should allow the police to slash auditors for multiple pending audits", async function() {
    police_timeout = 50;
    await quantstamp_audit_police.setPoliceTimeoutInBlocks(police_timeout);

    // add police node
    await quantstamp_audit_police.addPoliceNode(police1);
    all_police = [police1];

    // top up the stake of the auditor to 11,000 QSP (1000 more than the minStake)
    const extra_stake = Util.toQsp(1000);
    await stakeAuditor(extra_stake);

    const num_reports = 6;
    let requestIds = [];
    let i;
    for(i = 0; i < num_reports; i++) {
      requestIds.push(await submitNewReport());
    }

    const auditor_balance_before = await quantstamp_audit_token_escrow.depositsOf(auditor);
    assert.isTrue(auditor_balance_before.eq(min_stake.add(extra_stake)));

    const police_balances_before = await getPoliceBalances();

    let expected_total_slashed = new BN(0);
    let current_slash;
    let current_police_balance;
    let current_auditor_balance;
    let index;

    for(i = 0; i < num_reports; i++) {
      const result = await quantstamp_audit.submitPoliceReport(requestIds[i], Util.nonEmptyReport, false, {from: police1});

      if (i != num_reports - 1) {
        current_slash = slash_amount.add(expectedAuditorPayment);
        expected_total_slashed = current_slash.add(expected_total_slashed);
        index = 7;
      }
      else {
        current_slash = new BigNumber(extra_stake).plus(expectedAuditorPayment);
        expected_total_slashed = new BigNumber(current_slash).plus(expected_total_slashed);
        index = 8;  // there's an extra event due to the node being removed from the staked list
      }
      Util.assertNestedEventAtIndex({
        result: result,
        name: "PoliceFeesClaimed",
        args: (args) => {
          assert.isTrue(current_slash.eq(new BN(args.fee)));
        },
        index: index
      });

      current_auditor_balance = await quantstamp_audit_token_escrow.depositsOf(auditor);
      current_police_balance = await Util.balanceOf(quantstamp_token, quantstamp_audit_police.address);
      // the police nodes' QSP balance has increased
      await checkPoliceBalances(police_balances_before, expected_total_slashed);

      // the auditor's stake has decreased
      // must adjust for the amount paid from audit prices, as that was not staked
      assert.isTrue(new BigNumber(auditor_balance_before).sub(expected_total_slashed).plus(expectedAuditorPayment * (i + 1)).eq(current_auditor_balance));
    }

    // top up the auditors stake
    await stakeAuditor(min_stake);

    police_timeout = 15;
    await quantstamp_audit_police.setPoliceTimeoutInBlocks(police_timeout);
  });

  it("should allow auditors to claim rewards when the owner changes timeouts", async function() {
    const balance_before = await Util.balanceOf(quantstamp_token, auditor);

    const otherAuditPrice = 555;
    const otherExpectedAuditorPayment = new BN(otherAuditPrice - await quantstamp_audit_police.getPoliceFee(otherAuditPrice));

    await submitNewReport();

    // lower the police timeout
    police_timeout = 5;
    await quantstamp_audit_police.setPoliceTimeoutInBlocks(police_timeout);

    // submit a new report with a different price
    await quantstamp_audit.requestAudit(Util.uri, otherAuditPrice, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    const requestId = Util.extractRequestId(result);
    await quantstamp_audit.submitReport(requestId, AuditState.Completed, Util.emptyReport, {from : auditor});

    const num_blocks = police_timeout + 1;
    await Util.mineNBlocks(num_blocks);

    await quantstamp_audit.claimRewards({from: auditor});

    const balance_after = await Util.balanceOf(quantstamp_token, auditor);
    // the reward should include the 2nd price (555), but not the first (123)
    assert.isTrue(balance_before.add(otherExpectedAuditorPayment).eq(balance_after));

    // raise the police timeout
    police_timeout = 15;
    await quantstamp_audit_police.setPoliceTimeoutInBlocks(police_timeout);
    await Util.mineNBlocks(police_timeout + 1);

    await quantstamp_audit.claimRewards({from: auditor});

    const balance_after2 = await Util.balanceOf(quantstamp_token, auditor);
    assert.isTrue(balance_before.add(otherExpectedAuditorPayment).add(expectedAuditorPayment).eq(balance_after2));
  });

  it("should allow the owner to change the slash percentage", async function() {
    // a non-owner cannot make the change
    await Util.assertTxFail(quantstamp_audit_police.setSlashPercentage(25, {from: requestor}));
    await Util.assertTxFail(quantstamp_audit_police.setSlashPercentage(101));
    await quantstamp_audit_police.setSlashPercentage(100);
    slash_percentage = await quantstamp_audit_police.slashPercentage();
    slash_amount = await quantstamp_audit_token_escrow.getSlashAmount(slash_percentage);
    assert.equal(slash_percentage, 100);
    assert.isTrue(slash_amount.eq(min_stake));

    const police_balances_before = await getPoliceBalances();
    currentId = await submitNewReport();
    const result = await quantstamp_audit.submitPoliceReport(currentId, Util.nonEmptyReport, false, {from: police1});

    const auditor_balance_after = await quantstamp_audit_token_escrow.depositsOf(auditor);
    assert.equal(auditor_balance_after, 0);

    await checkPoliceBalances(police_balances_before, slash_amount);

    // reset slash percentage back to 5 percent
    await quantstamp_audit_police.setSlashPercentage(5);

    // top up the auditors stake
    await stakeAuditor(min_stake);
  });

  it("should allow the auditor to claim a specific reward", async function() {
    const balance_before = await Util.balanceOf(quantstamp_token, auditor);
    currentId = await submitNewReport();
    await Util.mineNBlocks(police_timeout + 1);

    // a user other than the auditor should not be able to claim the reward
    await Util.assertTxFail(quantstamp_audit.claimReward(currentId, {from: requestor}));

    await quantstamp_audit.claimReward(currentId, {from: auditor});

    const balance_after = await Util.balanceOf(quantstamp_token, auditor);

    assert.isTrue(balance_before.add(expectedAuditorPayment).eq(balance_after));
  });

  it("should allow the owner to change the report processing fee percentage", async function() {
    // a non-owner cannot make the change
    await Util.assertTxFail(quantstamp_audit_police.setReportProcessingFeePercentage(25, {from: requestor}));
    await Util.assertTxFail(quantstamp_audit_police.setReportProcessingFeePercentage(101));
    await quantstamp_audit_police.setReportProcessingFeePercentage(100);
    let reportProcessingPercentage = await quantstamp_audit_police.reportProcessingFeePercentage();
    expectedAuditorPayment = new BN(price - await quantstamp_audit_police.getPoliceFee(price));

    const balance_before = await Util.balanceOf(quantstamp_token, auditor);
    await submitNewReport();
    await Util.mineNBlocks(police_timeout + 1);
    await quantstamp_audit.claimRewards({from: auditor});
    const balance_after = await Util.balanceOf(quantstamp_token, auditor);
    assert.isTrue(balance_before.add(expectedAuditorPayment).eq(balance_after));
  });


  it("should allow a user to get the compressed report from QuantstampAudit", async function() {
    currentId = await submitNewReport();
    assert.equal(await quantstamp_audit.getReport(currentId), Util.emptyReport);

    // check for non-empty report
    await quantstamp_audit.requestAudit(Util.uri, price, {from: requestor});
    const result = await quantstamp_audit.getNextAuditRequest({from: auditor});
    currentId = Util.extractRequestId(result);
    await quantstamp_audit.submitReport(currentId, AuditState.Completed, Util.nonEmptyReport, {from : auditor});
    assert.equal(await quantstamp_audit.getReport(currentId), Util.nonEmptyReport);
  });

  it("canClaimAuditReward should return false for index 0", async function() {
    const result = await quantstamp_audit_police.canClaimAuditReward(auditor, 0);
    assert.isTrue(!result);
  });
});
