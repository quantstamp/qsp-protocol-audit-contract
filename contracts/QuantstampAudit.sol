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
  uint256 public auditTimeoutInBlocks = 10;

  // constants used by LinedListLib
  uint256 constant NULL = 0;
  uint256 constant HEAD = 0;
  bool constant PREV = false;
  bool constant NEXT = true;

  // maximum number of assigned audits per each auditor
  uint256 public maxAssignedRequests = 1;
  // mapping from an auditor address to the number of requests that it currently processes
  mapping(address => uint256) public assignedRequestsNum;

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

  event LogPayAuditor(uint256 requestId, address auditor, uint256 amount);
  event LogRefund(uint256 requestId, address requestor, uint256 amount);
  event LogTransactionFeeChanged(uint256 oldFee, uint256 newFee);
  event LogAuditQueueIsEmpty();

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
    queueAudit(requestId, HEAD);

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

    assignedRequestsNum[msg.sender] = assignedRequestsNum[msg.sender].sub(1);

    token.transfer(msg.sender, audit.price);
    emit LogPayAuditor(requestId, msg.sender, audit.price);
  }

  /**
   * @dev Finds a list of most expensive audits and assigns the oldest one to the auditor node.
   */
  function getNextAuditRequest() public onlyWhitelisted {

    uint256 assignedRequests = assignedRequestsNum[msg.sender];
    require(assignedRequests < maxAssignedRequests);

    uint256 requestId = dequeueAudit();

    if (requestId == 0) {
      emit LogAuditQueueIsEmpty();
      return;
    }

    audits[requestId].state = AuditState.Assigned;
    audits[requestId].auditor = msg.sender;
    audits[requestId].assignTimestamp = block.number;

    assignedRequestsNum[msg.sender] = assignedRequests + 1;

    emit LogAuditAssigned(requestId, audits[requestId].auditor);
  }

  /**
   * @dev Adds an audit request to the queue
   * @param requestId Request ID.
   * @param existingPrice price of an existing audit in the queue (makes insertion O(1))
   */
  function queueAudit(uint256 requestId, uint256 existingPrice) internal {
    uint256 price = audits[requestId].price;
    if (!priceList.nodeExists(price)) {
      // if a price bucket doesn't exist, create it next to an existing one
      priceList.insert(priceList.getSortedSpot(existingPrice, price, NEXT), price, PREV);
    }
    // push to the tail
    auditsByPrice[price].push(requestId, PREV);
  }

  /**
   * @dev Finds a list of most expensive audits and returns the oldest one.
   */
  function dequeueAudit() internal returns(uint256) {
    bool exists;
    uint256 price;

    // picks the tail of price buckets
    (exists, price) = priceList.getAdjacent(HEAD, PREV);

    // picks the oldest audit request
    uint256 result = auditsByPrice[price].pop(NEXT);
    // removes the price bucket if it contains no requests
    if (auditsByPrice[price].sizeOf() == 0) {
      priceList.remove(price);
    }
    return result;
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
  function refund(uint256 requestId) external onlyOwner returns(bool) {
    require(audits[requestId].requestor != address(0));
    return token.transfer(audits[requestId].requestor, audits[requestId].price);
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
      (exists, price) = priceList.getAdjacent(price, NEXT);
      numElements += auditsByPrice[price].sizeOf();
    }
    return numElements;
  }

  function setAuditTimeout(uint256 timeoutInBlocks) public {
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
