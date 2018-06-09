pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";

import "./LinkedListLib.sol";
import "./QuantstampAuditData.sol";

contract QuantstampAudit is Ownable, Pausable {
  using SafeMath for uint256;
  using LinkedListLib for LinkedListLib.LinkedList;

  // constants used by LinkedListLib
  uint256 constant NULL = 0;
  uint256 constant HEAD = 0;
  bool constant PREV = false;
  bool constant NEXT = true;

  // mapping from an auditor address to the number of requests that it currently processes
  mapping(address => uint256) public assignedRequestIds;

  // increasingly sorted linked list of prices
  LinkedListLib.LinkedList priceList;
  // map from price to a list of request IDs
  mapping(uint256 => LinkedListLib.LinkedList) auditsByPrice;

  // whitelist audit nodes
  LinkedListLib.LinkedList whitelistedList;

  // contract that stores audit data (separate from the auditing logic)
  QuantstampAuditData public auditData;

  event LogAuditFinished(
    uint256 requestId,
    address auditor,
    QuantstampAuditData.AuditState auditResult,
    string reportUri,
    string reportHash,
    uint256 reportTimestamp
  );

  event LogAuditRequested(uint256 requestId,
    address requestor,
    string uri,
    uint256 price,
    uint256 requestTimestamp
  );

  event LogAuditAssigned(uint256 requestId, address auditor);
  event LogReportSubmissionError_InvalidAuditor(uint256 requestId, address auditor);
  event LogReportSubmissionError_InvalidState(uint256 requestId, address auditor, QuantstampAuditData.AuditState state);
  event LogAuditQueueIsEmpty();

  event LogAuditAssignmentError_ExceededMaxAssignedRequests(address auditor);

  event LogPayAuditor(uint256 requestId, address auditor, uint256 amount);
  event LogAuditNodePriceChanged(address auditor, uint256 amount);

  event LogRefund(uint256 requestId, address requestor, uint256 amount);
  event LogRefundInvalidRequestor(uint256 requestId, address requestor);
  event LogRefundInvalidState(uint256 requestId, QuantstampAuditData.AuditState state);
  event LogRefundInvalidFundsLocked(uint256 requestId, uint256 currentBlock, uint256 fundLockEndBlock);

  // the audit queue has elements, but none satisfy the minPrice of the audit node
  // amount corresponds to the current minPrice of the auditor
  event LogAuditNodePriceHigherThanRequests(address auditor, uint256 amount);

  event WhitelistedAddressAdded(address addr);
  event WhitelistedAddressRemoved(address addr);

  /**
   * @dev The constructor creates an audit contract.
   * @param auditDataAddress The address of a AuditData that stores data used for performing audits.
   */
  constructor (address auditDataAddress) public {
    require(auditDataAddress != address(0));
    auditData = QuantstampAuditData(auditDataAddress);
  }

  /**
   * @dev Throws if called by any account that's not whitelisted.
   */
  modifier onlyWhitelisted() {
    require(whitelistedList.nodeExists(uint256(msg.sender)));
    _;
  }

  /**
   * @dev Submits audit request.
   * @param contractUri Identifier of the resource to audit.
   * @param price The total amount of tokens that will be paid for the audit.
   */
  function requestAudit(string contractUri, uint256 price) external whenNotPaused returns(uint256) {
    // transfer tokens to this contract
    auditData.token().transferFrom(msg.sender, this, price);
    // store the audit
    uint256 requestId = auditData.addAuditRequest(msg.sender, contractUri, price);

    // TODO: use existing price instead of HEAD (optimization)
    queueAuditRequest(requestId, HEAD);

    emit LogAuditRequested(requestId, msg.sender, contractUri, price, block.timestamp);

    return requestId;
  }

  /**
   * @dev Submits the report and pays the auditor node for their work or refunds tokens to the requestor in case of an error.
   * @param requestId Unique identifier of the audit request.
   * @param auditResult Result of an audit.
   * @param reportUri URI to the generated report.
   * @param reportHash Hash of the generated report.
   */
  function submitReport(uint256 requestId, QuantstampAuditData.AuditState auditResult, string reportUri, string reportHash) public onlyWhitelisted {
    QuantstampAuditData.AuditState auditState = auditData.getAuditState(requestId);
    if (auditState != QuantstampAuditData.AuditState.Assigned) {
      emit LogReportSubmissionError_InvalidState(requestId, msg.sender, auditState);
      return;
    }

    // the sender must be the auditor
    if (msg.sender != auditData.getAuditAuditor(requestId)) {
      emit LogReportSubmissionError_InvalidAuditor(requestId, msg.sender);
      return;
    }

    // update the audit information held in this contract
    auditData.setAuditState(requestId, auditResult);
    auditData.setAuditReportUri(requestId, reportUri);
    auditData.setAuditReportHash(requestId, reportHash);
    auditData.setAuditReportTimestamp(requestId, block.timestamp);

    // validate the audit state
    require(isAuditFinished(requestId));

    emit LogAuditFinished(requestId, msg.sender, auditResult, reportUri, reportHash, block.timestamp);

    assignedRequestIds[msg.sender] = assignedRequestIds[msg.sender].sub(1);

    uint256 auditPrice = auditData.getAuditPrice(requestId);
    auditData.token().transfer(msg.sender, auditPrice);
    emit LogPayAuditor(requestId, msg.sender, auditPrice);
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
    if (assignedRequests >= auditData.maxAssignedRequests()) {
      emit LogAuditAssignmentError_ExceededMaxAssignedRequests(msg.sender);
      return;
    }

    // there are no audits in the queue with a price high enough for the audit node
    uint256 minPrice = auditData.getMinAuditPrice(msg.sender);
    uint256 requestId = dequeueAuditRequest(minPrice);
    if (requestId == 0) {
      emit LogAuditNodePriceHigherThanRequests(msg.sender, minPrice);
      return;
    }

    auditData.setAuditState(requestId, QuantstampAuditData.AuditState.Assigned);
    auditData.setAuditAuditor(requestId, msg.sender);
    auditData.setAuditAssignTimestamp(requestId, block.number);

    assignedRequestIds[msg.sender] = assignedRequests + 1;

    emit LogAuditAssigned(requestId, auditData.getAuditAuditor(requestId));
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
    uint256 price = auditData.getAuditPrice(requestId);
    if (!priceList.nodeExists(price)) {
      // if a price bucket doesn't exist, create it next to an existing one
      priceList.insert(priceList.getSortedSpot(existingPrice, price, NEXT), price, PREV);
    }
    // push to the tail
    auditsByPrice[price].push(requestId, PREV);
  }

  /**
   * @dev Finds a list of most expensive audits and returns the oldest one that has a price >= minPrice
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
    uint256 price = auditData.getAuditPrice(requestId);

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
    auditData.setMinAuditPrice(msg.sender, price);
    emit LogAuditNodePriceChanged(msg.sender, price);
  }

  /**
   * @dev Checks if an audit is finished. It is considered finished when the audit is either completed or failed.
   * @param requestId Unique ID of the audit request.
   */
  function isAuditFinished(uint256 requestId) view public returns(bool) {
    QuantstampAuditData.AuditState state = auditData.getAuditState(requestId);
    return state == QuantstampAuditData.AuditState.Completed || state == QuantstampAuditData.AuditState.Error;
  }

  /**
   * @dev Returns funds to the requestor.
   * @param requestId Unique ID of the audit request.
   */
  function refund(uint256 requestId) external returns(bool) {
    QuantstampAuditData.AuditState state = auditData.getAuditState(requestId);
    // check that the audit exists and is in a valid state
    if(state != QuantstampAuditData.AuditState.Queued && state != QuantstampAuditData.AuditState.Assigned){
      emit LogRefundInvalidState(requestId, state);
      return;
    }
    address requestor = auditData.getAuditRequestor(requestId);
    if(requestor != msg.sender){
      emit LogRefundInvalidRequestor(requestId, msg.sender);
      return;
    }
    uint refundTimestamp = auditData.getAuditAssignTimestamp(requestId) + auditData.auditTimeoutInBlocks();
    // check that the auditor has not recently started the audit (locking the funds)
    if(state == QuantstampAuditData.AuditState.Assigned && block.number <= refundTimestamp){
      emit LogRefundInvalidFundsLocked(requestId, block.number, refundTimestamp);
      return;
    }

    // remove the request from the queue
    // note that if an audit node is currently assigned the request, it is already removed from the queue
    if(state == QuantstampAuditData.AuditState.Queued){
      removeQueueElement(requestId);
    }

    // set the audit state the refunded
    auditData.setAuditState(requestId, QuantstampAuditData.AuditState.Refunded);

    // return the funds to the user
    uint256 price = auditData.getAuditPrice(requestId);
    emit LogRefund(requestId, requestor, price);
    return auditData.token().transfer(requestor, price);
  }

  /**
   * @dev Adds an address to the whitelist
   * @param addr address
   * @return true if the address was added to the whitelist
   */
  function addAddressToWhitelist(address addr) onlyOwner public returns(bool success) {
    if (whitelistedList.insert(HEAD, uint256(addr), PREV)) {
      emit WhitelistedAddressAdded(addr);
      success = true;
    }
  }

  /**
   * @dev Removes an address from the whitelist linked-list
   * @param addr address
   * @return true if the address was removed from the whitelist,
   */
  function removeAddressFromWhitelist(address addr) onlyOwner public returns(bool success) {
    if (whitelistedList.remove(uint256(addr)) != 0) {
      emit WhitelistedAddressRemoved(addr);
      success = true;
    }
  }

  /**
   * @dev Given a whitelisted address, returns the next address from the whitelist
   * @param addr address
   * @return next address of the given param
   */
  function getNextWhitelistedAddress(address addr) public view returns(address) {
    bool direction;
    uint256 next;
    (direction, next) = whitelistedList.getAdjacent(uint256(addr), NEXT);
    return address(next);
  }

  /**
   * @dev Given a price, returns the next price from the priceList
   * @param price of the current node
   * @return next price in the linked list
   */
  function getNextPrice(uint256 price) public view returns(uint256) {
    bool direction;
    uint256 next;
    (direction, next) = priceList.getAdjacent(price, NEXT);
    return next;
  }

  /**
   * @dev Given a price and a requestId, then function returns the next requestId with the same price
   * return 0, provided the given price does not exist in auditsByPrice
   * @param price of the current bucket
   * @param requestId unique Id of an requested audit
   * @return next requestId with the same price
   */
  function getNextAuditByPrice(uint256 price, uint256 requestId) public view returns(uint256) {
    bool direction;
    uint256 next;
    (direction, next) =  auditsByPrice[price].getAdjacent(requestId, NEXT);
    return next;
  }
}
