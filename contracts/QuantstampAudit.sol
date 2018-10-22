pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";

import "./LinkedListLib.sol";
import "./QuantstampAuditData.sol";
import "./QuantstampAuditMultiRequestData.sol";
import "./QuantstampAuditReportData.sol";


contract QuantstampAudit is Ownable, Pausable {
  using SafeMath for uint256;
  using LinkedListLib for LinkedListLib.LinkedList;

  // constants used by LinkedListLib
  uint256 constant internal NULL = 0;
  uint256 constant internal HEAD = 0;
  bool constant internal PREV = false;
  bool constant internal NEXT = true;

  // mapping from an auditor address to the number of requests that it currently processes
  mapping(address => uint256) public assignedRequestCount;

  // increasingly sorted linked list of prices
  LinkedListLib.LinkedList internal priceList;
  // map from price to a list of request IDs
  mapping(uint256 => LinkedListLib.LinkedList) internal auditsByPrice;

  // list of request IDs of assigned audits (the list preserves temporal order of assignments)
  LinkedListLib.LinkedList internal assignedAudits;

  // contract that stores audit data (separate from the auditing logic)
  QuantstampAuditData public auditData;

  // contract that stores multirequest audit data
  QuantstampAuditMultiRequestData public multiRequestData;

  // contract that stores audit reports on-chain
  QuantstampAuditReportData public reportData;

  event LogAuditFinished(
    uint256 requestId,
    address auditor,
    QuantstampAuditData.AuditState auditResult,
    string reportHash
  );

  event LogAuditRequested(uint256 requestId,
    address requestor,
    string uri,
    uint256 price
  );

  event LogAuditAssigned(uint256 requestId,
    address auditor,
    address requestor,
    string uri,
    uint256 price,
    uint256 requestBlockNumber);

  /* solhint-disable event-name-camelcase */
  event LogReportSubmissionError_InvalidAuditor(uint256 requestId, address auditor);
  event LogReportSubmissionError_InvalidState(uint256 requestId, address auditor, QuantstampAuditData.AuditState state);
  event LogReportSubmissionError_InvalidResult(uint256 requestId, address auditor, QuantstampAuditData.AuditState state);
  event LogReportSubmissionError_ExpiredAudit(uint256 requestId, address auditor, uint256 allowanceBlockNumber);
  event LogAuditAssignmentError_ExceededMaxAssignedRequests(address auditor);
  event LogAuditAssignmentUpdate_Expired(uint256 requestId, uint256 allowanceBlockNumber);
  /* solhint-enable event-name-camelcase */

  event LogAuditQueueIsEmpty();

  event LogPayAuditor(uint256 requestId, address auditor, uint256 amount);
  event LogAuditNodePriceChanged(address auditor, uint256 amount);

  event LogRefund(uint256 requestId, address requestor, uint256 amount);
  event LogRefundInvalidRequestor(uint256 requestId, address requestor);
  event LogRefundInvalidState(uint256 requestId, QuantstampAuditData.AuditState state);
  event LogRefundInvalidFundsLocked(uint256 requestId, uint256 currentBlock, uint256 fundLockEndBlock);

  // the audit queue has elements, but none satisfy the minPrice of the audit node
  // amount corresponds to the current minPrice of the auditor
  event LogAuditNodePriceHigherThanRequests(address auditor, uint256 amount);

  event LogInvalidResolutionCall(uint256 requestId);
  event LogErrorReportResolved(uint256 requestId, address receiver, uint256 auditPrice);

  event LogMultiRequestRequested(uint256 multiRequestId, uint256 requestIdStart, uint256 requestIdEnd);
  event LogRequestAssignedFromMultiRequest(uint256 requestId, uint256 multiRequestId, address auditor);

  enum AuditAvailabilityState {
    Error,
    Ready,      // an audit is available to be picked up
    Empty,      // there is no audit request in the queue
    Exceeded,   // number of incomplete audit requests is reached the cap
    Underprice  // all queued audit requests are less than the expected price
  }

  /**
   * @dev The constructor creates an audit contract.
   * @param auditDataAddress The address of an AuditData that stores data used for performing audits.
   * @param reportDataAddress The address of a ReportData that stores audit reports.
   */
  constructor (address auditDataAddress, address multiRequestDataAddress, address reportDataAddress) public {
    require(auditDataAddress != address(0));
    require(multiRequestDataAddress != address(0));
    require(reportDataAddress != address(0));
    auditData = QuantstampAuditData(auditDataAddress);
    multiRequestData = QuantstampAuditMultiRequestData(multiRequestDataAddress);
    reportData = QuantstampAuditReportData(reportDataAddress);
  }

  /**
   * @dev Throws if called by any account that's not whitelisted.
   */
  modifier onlyWhitelisted() {
    require(auditData.isWhitelisted(msg.sender));
    _;
  }

  /**
   * @dev Returns funds to the requestor.
   * @param requestId Unique ID of the audit request.
   */
  function refund(uint256 requestId) external returns(bool) {
    QuantstampAuditData.AuditState state = auditData.getAuditState(requestId);
    // check that the audit exists and is in a valid state
    if (state != QuantstampAuditData.AuditState.Queued &&
          state != QuantstampAuditData.AuditState.Assigned &&
            state != QuantstampAuditData.AuditState.Expired) {
      emit LogRefundInvalidState(requestId, state);
      return false;
    }
    address requestor = auditData.getAuditRequestor(requestId);
    if (requestor != msg.sender) {
      emit LogRefundInvalidRequestor(requestId, msg.sender);
      return;
    }
    uint256 refundBlockNumber = auditData.getAuditAssignBlockNumber(requestId) + auditData.auditTimeoutInBlocks();
    // check that the auditor has not recently started the audit (locking the funds)
    if (state == QuantstampAuditData.AuditState.Assigned) {
      if (block.number <= refundBlockNumber) {
        emit LogRefundInvalidFundsLocked(requestId, block.number, refundBlockNumber);
        return false;
      }
      // the request is expired but not detected by getNextAuditRequest
      updateAssignedAudits(requestId);
    } else if (state == QuantstampAuditData.AuditState.Queued) {
      // remove the request from the queue
      // note that if an audit node is currently assigned the request, it is already removed from the queue
      removeQueueElement(requestId);
    }

    // set the audit state to refunded
    auditData.setAuditState(requestId, QuantstampAuditData.AuditState.Refunded);

    // return the funds to the user
    uint256 price = auditData.getAuditPrice(requestId);
    emit LogRefund(requestId, requestor, price);
    return auditData.token().transfer(requestor, price);
  }

  /**
   * @dev Submits a request to be audited multiple times
   * @param contractUri Identifier of the resource to audit.
   * @param price The total amount of tokens that will be paid per audit. The requester should
   * eventually pay price * count qsp.
   * @param count Number of audits by different Auditors
   */
  function multiRequestAudit(string contractUri, uint256 price, uint256 count) external whenNotPaused returns(uint256[]) {
    require(count > 1, "multiRequest must be more than one");
    require(price.mul(count) <= auditData.token().allowance(msg.sender, address(this)),
      "token transfer must be approved more than price*count");
    uint256[] memory result = new uint256[](count);
    uint256 newMultiRequestId = multiRequestData.addMultiRequest(address(msg.sender), 0, 0, address(this));
    for (uint256 i = 0; i < count; ++i) {
      result[i] = requestAudit(contractUri, price);
      multiRequestData.setRequestIdToMultiRequestId(result[i], newMultiRequestId);
    }
    multiRequestData.setMultiRequestFirstRequestId(newMultiRequestId, result[0]);
    multiRequestData.setMultiRequestLastRequestId(newMultiRequestId, result[result.length-1]);
    emit LogMultiRequestRequested(newMultiRequestId,
      multiRequestData.getMultiRequestFirstRequestId(newMultiRequestId),
      multiRequestData.getMultiRequestLastRequestId(newMultiRequestId));
    return result;
  }

  /**
   * @dev Submits audit request.
   * @param contractUri Identifier of the resource to audit.
   * @param price The total amount of tokens that will be paid for the audit.
   */
  function requestAudit(string contractUri, uint256 price) public whenNotPaused returns(uint256) {
    require(price > 0);
    // transfer tokens to this contract
    auditData.token().transferFrom(msg.sender, address(this), price);
    // store the audit
    uint256 requestId = auditData.addAuditRequest(msg.sender, contractUri, price);

    // TODO: use existing price instead of HEAD (optimization)
    queueAuditRequest(requestId, HEAD);

    emit LogAuditRequested(requestId, msg.sender, contractUri, price); // solhint-disable-line not-rely-on-time

    return requestId;
  }

  /**
   * @dev Submits the report and pays the auditor node for their work if the audit is completed.
   * @param requestId Unique identifier of the audit request.
   * @param auditResult Result of an audit.
   * @param reportHash Hash of the generated report.
   * @param report fixed size array stores a compressed report. TODO, let's document the report format.
   */
  function submitReport(uint256 requestId, QuantstampAuditData.AuditState auditResult, string reportHash, bytes report) public onlyWhitelisted {
    if (QuantstampAuditData.AuditState.Completed != auditResult && QuantstampAuditData.AuditState.Error != auditResult) {
      emit LogReportSubmissionError_InvalidResult(requestId, msg.sender, auditResult);
      return;
    }

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

    // remove the requestId from assigned queue
    updateAssignedAudits(requestId);

    // auditor should not send a report after its allowed period
    uint256 allowanceBlockNumber = auditData.getAuditAssignBlockNumber(requestId) + auditData.auditTimeoutInBlocks();
    if (allowanceBlockNumber < block.number) {
      // update assigned to expired state
      auditData.setAuditState(requestId, QuantstampAuditData.AuditState.Expired);
      emit LogReportSubmissionError_ExpiredAudit(requestId, msg.sender, allowanceBlockNumber);
      return;
    }

    // update the audit information held in this contract
    auditData.setAuditState(requestId, auditResult);
    auditData.setAuditReportHash(requestId, reportHash);
    auditData.setAuditReportBlockNumber(requestId, block.number); // solhint-disable-line not-rely-on-time

    // validate the audit state
    require(isAuditFinished(requestId));

    // store reports on-chain
    reportData.setReport(requestId, report);

    emit LogAuditFinished(requestId, msg.sender, auditResult, reportHash); // solhint-disable-line not-rely-on-time

    if (auditResult == QuantstampAuditData.AuditState.Completed) {
      uint256 auditPrice = auditData.getAuditPrice(requestId);
      auditData.token().transfer(msg.sender, auditPrice);
      emit LogPayAuditor(requestId, msg.sender, auditPrice);
    }
  }

  /**
   * @dev Determines who has to be paid for a given requestId recorded with an error status
   * @param requestId Unique identifier of the audit request.
   * @param toRequester The audit price goes to the requester or the audit node.
   */
  function resolveErrorReport(uint256 requestId, bool toRequester) public onlyOwner {
    QuantstampAuditData.AuditState auditState = auditData.getAuditState(requestId);
    if (auditState != QuantstampAuditData.AuditState.Error) {
      emit LogInvalidResolutionCall(requestId);
      return;
    }

    uint256 auditPrice = auditData.getAuditPrice(requestId);
    address receiver = toRequester ? auditData.getAuditRequestor(requestId) : auditData.getAuditAuditor(requestId);
    auditData.token().transfer(receiver, auditPrice);
    auditData.setAuditState(requestId, QuantstampAuditData.AuditState.Resolved);
    emit LogErrorReportResolved(requestId, receiver, auditPrice);
  }

  /**
   * @dev Determines if there is an audit request available to be picked up by the caller
   */
  function anyRequestAvailable() public view returns(AuditAvailabilityState) {
    uint256 requestId;

    // only whitelisted nodes are able to call this function
    if (!auditData.isWhitelisted(msg.sender)) {
      return AuditAvailabilityState.Error;
    }

    // there are no audits in the queue
    if (!auditQueueExists()) {
      return AuditAvailabilityState.Empty;
    }

    // check if the auditor's assignment is not exceeded.
    if (assignedRequestCount[msg.sender] >= auditData.maxAssignedRequests()) {
      return AuditAvailabilityState.Exceeded;
    }

    requestId = anyAuditRequestMatchesPrice(auditData.getMinAuditPrice(msg.sender));
    if (requestId == 0) {
      return AuditAvailabilityState.Underprice;
    }
    return AuditAvailabilityState.Ready;
  }

  /**
   * @dev Finds a list of most expensive audits and assigns the oldest one to the auditor node.
   */
  function getNextAuditRequest() public onlyWhitelisted {
    // remove an expired audit request
    if (assignedAudits.listExists()) {
      bool exists;
      uint256 potentialExpiredRequestId;
      (exists, potentialExpiredRequestId) = assignedAudits.getAdjacent(HEAD, NEXT);
      uint256 allowanceBlockNumber = auditData.getAuditAssignBlockNumber(potentialExpiredRequestId) + auditData.auditTimeoutInBlocks();
      if (allowanceBlockNumber < block.number) {
        updateAssignedAudits(potentialExpiredRequestId);
        auditData.setAuditState(potentialExpiredRequestId, QuantstampAuditData.AuditState.Expired);
        emit LogAuditAssignmentUpdate_Expired(potentialExpiredRequestId, allowanceBlockNumber);
      }
    }

    AuditAvailabilityState isRequestAvailable = anyRequestAvailable();
    // there are no audits in the queue
    if (isRequestAvailable == AuditAvailabilityState.Empty) {
      emit LogAuditQueueIsEmpty();
      return;
    }

    // check if the auditor's assignment is not exceeded.
    if (isRequestAvailable == AuditAvailabilityState.Exceeded) {
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
    auditData.setAuditAssignBlockNumber(requestId, block.number);
    assignedRequestCount[msg.sender]++;
    // push to the tail
    assignedAudits.push(requestId, PREV);

    assignMultirequest(requestId);

    emit LogAuditAssigned(
      requestId,
      auditData.getAuditAuditor(requestId),
      auditData.getAuditRequestor(requestId),
      auditData.getAuditContractUri(requestId),
      auditData.getAuditPrice(requestId),
      auditData.getAuditRequestBlockNumber(requestId));
  }

  /**
   * @dev Allows the audit node to set its minimum price per audit in wei-QSP
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
  function isAuditFinished(uint256 requestId) public view returns(bool) {
    QuantstampAuditData.AuditState state = auditData.getAuditState(requestId);
    return state == QuantstampAuditData.AuditState.Completed || state == QuantstampAuditData.AuditState.Error;
  }

  /**
   * @dev Given a price, returns the next price from the priceList
   * @param price of the current node
   * @return next price in the linked list
   */
  function getNextPrice(uint256 price) public view returns(uint256) {
    bool exists;
    uint256 next;
    (exists, next) = priceList.getAdjacent(price, NEXT);
    return next;
  }

  /**
   * @dev Given a requestId, returns the next one from assignedAudits
   * @param requestId of the current node
   * @return next requestId in the linked list
   */
  function getNextAssignedRequest(uint256 requestId) public view returns(uint256) {
    bool exists;
    uint256 next;
    (exists, next) = assignedAudits.getAdjacent(requestId, NEXT);
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
    bool exists;
    uint256 next;
    (exists, next) = auditsByPrice[price].getAdjacent(requestId, NEXT);
    return next;
  }

  /**
   * @dev Given a requestId, the function removes it from the list of audits and decreases the number of assigned
   * audits of the associated auditor
   * @param requestId unique Id of an requested audit
   */
  function updateAssignedAudits(uint256 requestId) internal {
    assignedAudits.remove(requestId);
    assignedRequestCount[auditData.getAuditAuditor(requestId)] =
      assignedRequestCount[auditData.getAuditAuditor(requestId)].sub(1);
  }

  /**
   * @dev Checks if the list of audits has any elements
   */
  function auditQueueExists() internal view returns(bool) {
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
   * @dev Evaluates if there is an audit price >= minPrice. Returns (false, 0) if there no audit with the desired price.
   * Note that there should not be any audit with price as 0. Also, this function evaluates if the given auditor has not
   * yet assigned to any individual audit of a multiRequest.
   * @param minPrice The minimum audit price.
   */
  function anyAuditRequestMatchesPrice(uint256 minPrice) internal view returns(uint256) {
    bool priceExists;
    uint256 price;
    uint256 requestId;
    uint256 multirequestId;

    // picks the tail of price buckets
    (priceExists, price) = priceList.getAdjacent(HEAD, PREV);
    // iterating in reverse order over price buckets for finding an appropriated request
    while (price != HEAD && price >= minPrice) {
      requestId = getNextAuditByPrice(price, HEAD);
      // iterating over requests in each price bucket. the iteration starts from older requests to younger ones.
      while (requestId != HEAD) {
        multirequestId = multiRequestData.getMultiRequestIdGivenRequestId(requestId);
        // if this request belongs to a multirequest, find out whether an auditor calling this function has been
        // already assigned to another request from the same multirequest.
        // true condition means that this request is not associated to a multirequest.
        if (multirequestId == 0 || !multiRequestData.existsAuditorFromMultiRequestAssignment(multirequestId, msg.sender)) {
          return requestId;
        } else {
          // the given auditor already audited an individual audit from this multi audit request. Let's
          // jump to the last individual associated requestId.
          requestId = multiRequestData.getMultiRequestLastRequestId(multirequestId);
        }
        requestId = getNextAuditByPrice(price, requestId);
      }
      (priceExists, price) = priceList.getAdjacent(price, PREV);
    }

    return 0;
  }

  /**
   * @dev Finds a list of most expensive audits and returns the oldest one that has a price >= minPrice
   * @param minPrice The minimum audit price.
   */
  function dequeueAuditRequest(uint256 minPrice) internal returns(uint256) {

    uint256 requestId;
    uint256 price;

    // picks the tail of price buckets
    // TODO seems the following statement is redundantly called from getNextAuditRequest. If this is the only place
    // to call dequeueAuditRequest, then removing the following line saves gas, but leaves dequeueAuditRequest
    // unsafe for further extension by noobies.
    requestId = anyAuditRequestMatchesPrice(minPrice);

    if (requestId > 0) {
      price = auditData.getAuditPrice(requestId);
      auditsByPrice[price].remove(requestId);
      // removes the price bucket if it contains no requests
      if (!auditsByPrice[price].listExists()) {
        priceList.remove(price);
      }
      return requestId;
    }
    return 0;
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
    if (!auditsByPrice[price].listExists()) {
      priceList.remove(price);
    }
  }

  /**
   * @dev Manages request if it is from a multirequest
   * @param requestId Unique ID of the audit request.
   */
  function assignMultirequest(uint256 requestId) internal {
    uint256 multirequestId = multiRequestData.getMultiRequestIdGivenRequestId(requestId);
    // record, if the requestId belongs to a multiRequestId
    if (multirequestId > 0) {
      multiRequestData.addAuditorToMultiRequestAssignment(multirequestId, msg.sender);
      emit LogRequestAssignedFromMultiRequest(requestId, multirequestId, msg.sender);
    }
  }
}
