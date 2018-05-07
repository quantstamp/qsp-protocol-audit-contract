const Util = require("./util.js");
const AuditState = Util.AuditState;
const assertEvent = Util.assertEvent;
const assertEventAtIndex = Util.assertEventAtIndex;
const extractRequestId = Util.extractRequestId;

const QuantstampAudit = artifacts.require('QuantstampAudit');
const QuantstampToken = artifacts.require('QuantstampToken');


contract('QuantstampAudit_ordering', function(accounts) {
  const owner = accounts[0];
  const admin = accounts[1];
  const requestor = accounts[2];
  const auditor = accounts[3];
  const price = 123;
  const requestorBudget = Util.toQsp(100000);
  const uri = "http://www.quantstamp.com/contract1.sol";
  const reportUri = "http://www.quantstamp.com/report.md";
  const sha256emptyFile = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  let requestCounter = 1;
  let quantstamp_audit;
  let quantstamp_token;


  // submits a request for each price in order, returning the array of ids of the requests
  async function submitMultipleRequests(prices){
    var ids = []
    for(i in prices){
      await quantstamp_audit.requestAudit(uri, price, {from:requestor});
      ids.push(requestCounter++);
    }
    return ids;
  }

  // gets a series of requests, returning the array of ids of the requests in the order retrieved
  async function getMultipleRequests(num_requests){
    var ids = [];
    let result;
    for(var i = 0; i < num_requests; i++){
      result = await quantstamp_audit.getNextAuditRequest({from:auditor});
      ids.push(extractRequestId(result));
    }
    return ids;
  }

  // given an array, returns the stable sort of indices rather than values
  // example: requestAuditPrices = [1, 3, 3, 2]
  // output (indices in the order audit nodes should pick from the queue): [0, 3, 1, 2]
  function getSortedIndices(l){
    var indexed_elements = [];
    var indices = [];
    for(let i = 0; i < l.length; i++){
      indexed_elements.push({index: i, value: l[i]});
    }
    indexed_elements.sort( (p1, p2) => {
      if (p1.value > p2.value || (p1.value === p2.value && p1.index < p2.index)) return -1;
      else return 1;
    });
    for(let i = 0; i < indexed_elements.length; i++){
      indices.push(indexed_elements[i].index);
    }
    return indices;
  }

  // ensures that the order in which audit nodes receive audits adheres to our requirements: 
  // higher priced audits are chosen first, tie-breaking on age
  async function check_ordering(prices){
    var sorted_indices = getSortedIndices(prices); 
    var request_ids = await submitMultipleRequests(prices);
    var audit_ids = await getMultipleRequests(prices.length);

    // console.log("IDs: " + request_ids);
    // console.log("Sorted Indices: " + sorted_indices);
    // console.log("Audit IDs: " + audit_ids);

    for(let i = 0; i < audit_ids.length; i++){
      assert.equal(audit_ids[i], request_ids[sorted_indices[i]]);
    }
  }


  beforeEach(async function () {
    quantstamp_audit = await QuantstampAudit.deployed();
    quantstamp_token = await QuantstampToken.deployed();
    // enable transfers before any payments are allowed
    await quantstamp_token.enableTransfer({from : owner});
    // transfer 100,000 QSP tokens to the requestor
    await quantstamp_token.transfer(requestor, requestorBudget, {from : owner});
    // allow the audit contract use up to 65QSP for audits
    await quantstamp_token.approve(quantstamp_audit.address, Util.toQsp(1000), {from : requestor});
    // whitelisting auditor
    await quantstamp_audit.addAddressToWhitelist(auditor);
  });


  it("queues requests with different prices in the correct order", async function() {
    await check_ordering([price + 1, price]);
  });

  it("prioritizes higher priced requests", async function() {
    await check_ordering([price, price + 1]);
  });

  it("prioritizes older requests if the price is the same", async function() {
    await check_ordering([price, price]);
  });

  it("provides the correct audits after a price bucket is diminished and refilled", async function() {
    await check_ordering([price, price]);
    await check_ordering([price, price]);
  });

  it("can handle a large number of audit requests", async function() {
    var prices = [];
    const NUM_REQUESTS = 100;
    for(let i = 0; i < NUM_REQUESTS; i++){
      prices.push(i+1);
    }
    await check_ordering(prices);
  });



});
