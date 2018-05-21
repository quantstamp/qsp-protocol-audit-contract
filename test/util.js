function toEther (n) {
  return web3.toWei(n, "ether");
}

async function expectThrow (promise) {
  try {
    await promise;
  } catch (error) {
    const invalidOpcode = error.message.search("invalid opcode") >= 0;
    const invalidJump = error.message.search("invalid JUMP") >= 0;
    const outOfGas = error.message.search("out of gas") >= 0;
    assert(invalidOpcode || invalidJump || outOfGas, `Expected throw, got ${error} instead`);
    return;
  }
  assert.fail("Expected throw not received");
}

async function assertTxFail (promise) {
  let txFailed = false;
  try {
    const result = await promise;
    txFailed = parseInt(result.receipt.status) === 0;
  } catch (err) {
    txFailed = (err.message.startsWith("VM Exception while processing transaction: revert"));
  }
  assert.isTrue(txFailed);
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

const AuditState = Object.freeze({
  None : 0,
  Queued : 1,
  Assigned : 2,
  Refunded : 3,
  Completed : 4,
  Error : 5
});

async function balanceOf (token, user) {
  return (await token.balanceOf(user)).toNumber();
}

async function allowance (token, owner, spender) {
  return (await token.allowance(owner, spender)).toNumber();
}

async function getReportUri (quantstamp_audit, requestId) {
  const reportUriIndex = 7;
  return (await quantstamp_audit.audits.call(requestId))[reportUriIndex];
}

async function getAuditState (quantstamp_audit_data, requestId) {
  const stateIndex = 4;
  return (await quantstamp_audit_data.audits.call(requestId))[stateIndex];
}

async function getOwnerBalance () {
  return await web3.eth.getBalance(owner);
}

function extractRequestId(result) {
  return result.logs[0].args.requestId.toNumber();
}


module.exports = {
  toEther : toEther,
  toQsp : toEther,
  oneEther : toEther(1),
  twoEther : toEther(2),
  threeEther : toEther(3),
  tenEther : toEther(10),
  hundredEther : toEther(100),
  expectThrow : expectThrow,
  assertTxFail : assertTxFail,
  assertEvent : assertEvent,
  assertEventAtIndex : assertEventAtIndex,
  AuditState : AuditState,
  balanceOf : balanceOf,
  allowance : allowance,
  getReportUri : getReportUri,
  getAuditState : getAuditState,
  getOwnerBalance : getOwnerBalance,
  extractRequestId : extractRequestId
};

