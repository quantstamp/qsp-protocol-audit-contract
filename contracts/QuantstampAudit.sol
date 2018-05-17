pragma solidity 0.4.23;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";

import "./LinkedListLib.sol";

contract QuantstampAudit is Ownable, Whitelist, Pausable {
  using SafeMath for uint256;
  using LinkedListLib for LinkedListLib.LinkedList;

  // state of audit requests submitted to the contract
  enum AuditState {
    None,
    Queued,
    Assigned,
    Refunded,
    Completed,  // automated audit finished successfully and the report is available
    Error       // automated audit failed to finish; the report contains detailed information about the error
  }

  // structure representing an audit
  struct Audit {
    address requestor;
    string contractUri;
    uint256 price;
    uint256 transactionFee;
    uint requestTimestamp; // approximate time of when audit was requested
    AuditState state;
    address auditor;       // the address of the node assigned to the audit
    uint assignTimestamp;  // approximate time of when audit was assigned
    string reportUri;      // stores the audit report URI
    string reportHash;     // stores the hash of audit report
    uint reportTimestamp;  // approximate time of when the payment and the audit report were submitted
  }

  // map audits (requestId, Audit)
  mapping(uint256 => Audit) public audits;

  // 10 blocks seems like a reasonable default timeout
  // Once an audit node gets an audit request, the audit price is locked for this many blocks.
  // After that, the requestor can asks for a refund.
  uint256 public auditTimeoutInBlocks = 10;

  // constants used by LinkedListLib
  uint256 constant NULL = 0;
  uint256 constant HEAD = 0;
  bool constant PREV = false;
  bool constant NEXT = true;

  // maximum number of assigned audits per each auditor
  uint256 public maxAssignedRequests = 1;
  // mapping from an auditor address to the number of requests that it currently processes
  mapping(address => uint256) public assignedRequestIds;

  // increasingly sorted linked list of prices
  LinkedListLib.LinkedList priceList;
  // map from price to a list of request IDs
  mapping(uint256 => LinkedListLib.LinkedList) auditsByPrice;

  // token used to pay for audits. This contract assumes that the owner of the contract trusts token's code and
  // that transfer function (such as transferFrom, transfer) do the right thing
  StandardToken public token;

  // transaction fee is required to pay auditors their reward or refund the tokens to the requestor
  // the fee is used to offset the gas cost needed to invoke submitReport()
  // TODO: remove
  uint256 public transactionFee;

  // map audit nodes to their minimum prices. Defaults to zero: the node accepts all requests.
  mapping(address => uint256) public minAuditPrice;

  event LogAuditFinished(
    uint256 requestId,
    address auditor,
    AuditState auditResult,
    string reportUri,
    string reportHash,
    uint256 reportTimestamp
  );

  event LogAuditRequested(uint256 requestId,
    address requestor,
    string uri,
    uint256 price,
    uint256 transactionFee,
    uint256 requestTimestamp
  );

  event LogAuditAssigned(uint256 requestId, address auditor);
  event LogReportSubmissionError_InvalidAuditor(uint256 requestId, address auditor);
  event LogReportSubmissionError_InvalidState(uint256 requestId, address auditor, AuditState state);
  event LogAuditQueueIsEmpty();

  event LogAuditAssignmentError_ExceededMaxAssignedRequests(address auditor);

  event LogPayAuditor(uint256 requestId, address auditor, uint256 amount);
  event LogTransactionFeeChanged(uint256 oldFee, uint256 newFee);
  event LogAuditNodePriceChanged(address auditor, uint256 amount);

  event LogRefund(uint256 requestId, address requestor, uint256 amount);
  event LogRefundInvalidRequestor(uint256 requestId, address requestor);
  event LogRefundInvalidState(uint256 requestId, AuditState state);
  event LogRefundInvalidFundsLocked(uint256 requestId, uint256 currentBlock, uint256 fundLockEndBlock);

  
  
  // the audit queue has elements, but none satisfy the minPrice of the audit node
  // amount corresponds to the current minPrice of the auditor
  event LogAuditNodePriceHigherThanRequests(address auditor, uint256 amount);

  uint256 private requestCounter;

  /**
   * @dev The constructor creates an audit contract.
   * @param tokenAddress The address of a StandardToken that will be used to pay auditor nodes.
   */
  constructor (address tokenAddress) public {
    require(tokenAddress != address(0));
    token = StandardToken(tokenAddress);
  }

  /**
   * @dev Submits audit request.
   * @param contractUri Identifier of the resource to audit.
   * @param price The total amount of tokens that will be paid for the audit.
   */
  function requestAudit(string contractUri, uint256 price) external payable whenNotPaused returns(uint256) {
    // check if user sends enough pre-paid gas
    require(msg.value >= transactionFee); // TODO: there should be an event if this fails
    // the sender is the requestor
    address requestor = msg.sender;
    // TODO: remove and make the function non-payable
    // transfer transaction fee (in Wei) to the contract owner to offset gas cost
    owner.transfer(msg.value);
    // transfer tokens to this contract
    token.transferFrom(msg.sender, this, price);
    // assign the next request ID
    uint256 requestId = ++requestCounter;
    // store the audit
    audits[requestId] = Audit(msg.sender, contractUri, price, transactionFee, block.timestamp, AuditState.Queued, address(0), 0, "", "", 0);

    // TODO: use existing price instead of HEAD (optimization)
    queueAuditRequest(requestId, HEAD);

    emit LogAuditRequested(requestId, requestor, contractUri, price, transactionFee, block.timestamp);

    return requestId;
  }

  /**
   * @dev Submits the report and pays the auditor node for their work or refunds tokens to the requestor in case of an error.
   * @param requestId Unique identifier of the audit request.
   * @param auditResult Result of an audit.
   * @param reportUri URI to the generated report.
   * @param reportHash Hash of the generated report.
   */
  function submitReport(uint256 requestId, AuditState auditResult, string reportUri, string reportHash) public onlyWhitelisted {
    Audit storage audit = audits[requestId];
    if (audit.state != AuditState.Assigned) {
      emit LogReportSubmissionError_InvalidState(requestId, msg.sender, audit.state);
      return;
    }

    // the sender must be the auditor
    if (msg.sender != audit.auditor)  {
      emit LogReportSubmissionError_InvalidAuditor(requestId, msg.sender);
      return;
    }

    // update the audit information held in this contract
    audit.state = auditResult;
    audit.reportUri = reportUri;
    audit.reportHash = reportHash;
    audit.reportTimestamp = block.timestamp;

    // validate the audit state
    require(isAuditFinished(requestId));

    emit LogAuditFinished(requestId,  msg.sender, auditResult, reportUri, reportHash, block.timestamp);

    assignedRequestIds[msg.sender] = assignedRequestIds[msg.sender].sub(1);

    token.transfer(msg.sender, audit.price);
    emit LogPayAuditor(requestId, msg.sender, audit.price);
  }

  /**
   * @dev Finds a list of most expensive audits and assigns the oldest one to the auditor node. 
   */
  function getNextAuditRequest() public onlyWhitelisted {
    // there are no audits in the queue
    if (! auditQueueExists()) {
      emit LogAuditQueueIsEmpty();
      return;
    }

    // check if the auditor's assignment is not exceeded.
    uint256 assignedRequests = assignedRequestIds[msg.sender];
    if (assignedRequests >= maxAssignedRequests) {
      emit LogAuditAssignmentError_ExceededMaxAssignedRequests(msg.sender);
      return;
    }

    // there are no audits in the queue with a price high enough for the audit node
    uint256 minPrice = minAuditPrice[msg.sender];
    uint256 requestId = dequeueAuditRequest(minPrice);
    if (requestId == 0) {
      emit LogAuditNodePriceHigherThanRequests(msg.sender, minPrice);
      return;
    }

    audits[requestId].state = AuditState.Assigned;
    audits[requestId].auditor = msg.sender;
    audits[requestId].assignTimestamp = block.number;

    assignedRequestIds[msg.sender] = assignedRequests + 1;

    emit LogAuditAssigned(requestId, audits[requestId].auditor);
  }

  /**
   * @dev Checks if the list of audits has any elements
   */
  function auditQueueExists() view internal returns(bool) {
    return priceList.listExists();
  }

  /**
   * @dev Adds an audit request to the queue
   * @param requestId Request ID.
   * @param existingPrice price of an existing audit in the queue (makes insertion O(1))
   */
  function queueAuditRequest(uint256 requestId, uint256 existingPrice) internal {
    uint256 price = audits[requestId].price;
    if (!priceList.nodeExists(price)) {
      // if a price bucket doesn't exist, create it next to an existing one
      priceList.insert(priceList.getSortedSpot(existingPrice, price, NEXT), price, PREV);
    }
    // push to the tail
    auditsByPrice[price].push(requestId, PREV);
  }

  /**
   * @dev Finds a list of most expensive audits and returns the oldest one that has a price > minPrice
   * @param minPrice The minimum audit price.
   */
  function dequeueAuditRequest(uint256 minPrice) internal returns(uint256) {
    bool exists;
    uint256 price;

    // picks the tail of price buckets
    (exists, price) = priceList.getAdjacent(HEAD, PREV);
    
    if(price < minPrice){
      return 0;
    }

    // picks the oldest audit request
    uint256 result = auditsByPrice[price].pop(NEXT);
    // removes the price bucket if it contains no requests
    if (auditsByPrice[price].sizeOf() == 0) {
      priceList.remove(price);
    }
    return result;
  }

  /**
   * @dev Removes an element from the list
   * @param requestId The Id of the request to be removed
   */
  function removeQueueElement(uint256 requestId) internal {
    uint256 price = audits[requestId].price;

    // the node must exist in the list
    require(priceList.nodeExists(price));
    require(auditsByPrice[price].nodeExists(requestId));

    auditsByPrice[price].remove(requestId);
    if (auditsByPrice[price].sizeOf() == 0) {
      priceList.remove(price);
    }
  }

  /**
   * @dev Allows the audit node to set its minimum price per audit
   * @param price The minimum price.  
   */
  function setAuditNodePrice(uint256 price) public onlyWhitelisted {
    minAuditPrice[msg.sender] = price;
    emit LogAuditNodePriceChanged(msg.sender, price);
  }

  /**
   * @dev Sets transaction fee in Wei
   * @param fee Transaction fee in Wei.
   */
  function setTransactionFee(uint256 fee) external onlyOwner {
    emit LogTransactionFeeChanged(transactionFee, fee);
    transactionFee = fee;
  }

  /**
   * @dev Checks if an audit is finished. It is considered finished when the audit is either completed or failed.
   * @param requestId Unique ID of the audit request.
   */
  function isAuditFinished(uint256 requestId) view public returns(bool) {
    return audits[requestId].state == AuditState.Completed
      || audits[requestId].state == AuditState.Error;
  }

  /**
   * @dev Returns funds to the requestor.
   * @param requestId Unique ID of the audit request.
   */
  function refund(uint256 requestId) external returns(bool) {
    Audit storage audit = audits[requestId];
    // check that the audit exists and is in a valid state
    if(audit.state != AuditState.Queued && audit.state != AuditState.Assigned){
      emit LogRefundInvalidState(requestId, audit.state);
      return;
    }
    if(audit.requestor != msg.sender){
      emit LogRefundInvalidRequestor(requestId, msg.sender);
      return;
    }
    // check that the auditor has not recently started the audit (locking the funds)
    if(audit.state == AuditState.Assigned && block.number <= audit.assignTimestamp + auditTimeoutInBlocks){
      emit LogRefundInvalidFundsLocked(requestId, block.number, audit.assignTimestamp + auditTimeoutInBlocks);
      return;
    }

    // remove the request from the queue
    // note that if an audit node is currently assigned the request, it is already removed from the queue
    if(audit.state == AuditState.Queued){
      removeQueueElement(requestId);
    }

    // set the audit state the refunded
    audit.state = AuditState.Refunded;

    // return the funds to the user
    emit LogRefund(requestId, audit.requestor, audit.price);
    return token.transfer(audit.requestor, audit.price);
  }

  function getAuditState(uint256 requestId) public view returns(AuditState) {
    return audits[requestId].state;
  }

  /**
   * @dev Returns the number of unassigned audit requests in the queue.
   */
  function getQueueLength() public view returns(uint256 numElements) {
    bool exists;
    uint256 price;
    // iterate over the price list
    (exists, price) = priceList.getAdjacent(HEAD, NEXT);
    while (price != HEAD) {
      numElements += auditsByPrice[price].sizeOf();
      (exists, price) = priceList.getAdjacent(price, NEXT);
    }
    return numElements;
  }

  function setAuditTimeout(uint256 timeoutInBlocks) public onlyOwner {
    auditTimeoutInBlocks = timeoutInBlocks;
  }

  /**
   * @dev set the maximum number of audits any audit node can handle at any time.
   * @param maxAssignments maximum number of audit requests for each auditor
   */
  function setMaxAssignedRequests(uint256 maxAssignments) public onlyOwner {
    maxAssignedRequests = maxAssignments;
  }
}
