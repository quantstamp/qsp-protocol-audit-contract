pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";

import "./LinkedListLib.sol";
import "./QuantstampAuditData.sol";
import "./QuantstampAuditReportData.sol";
import "./QuantstampAuditPolice.sol";
import "./QuantstampAuditTokenEscrow.sol";


contract QuantstampAudit is Pausable {
  using SafeMath for uint256;
  using LinkedListLib for LinkedListLib.LinkedList;

  // constants used by LinkedListLib
  uint256 constant internal NULL = 0;
  uint256 constant internal HEAD = 0;
  bool constant internal PREV = false;
  bool constant internal NEXT = true;

  uint256 private minAuditPriceLowerCap = 0;

  // mapping from an audit node address to the number of requests that it currently processes
  mapping(address => uint256) public assignedRequestCount;

  // increasingly sorted linked list of prices
  LinkedListLib.LinkedList internal priceList;
  // map from price to a list of request IDs
  mapping(uint256 => LinkedListLib.LinkedList) internal auditsByPrice;

  // list of request IDs of assigned audits (the list preserves temporal order of assignments)
  LinkedListLib.LinkedList internal assignedAudits;

  // stores request ids of the most recently assigned audits for each audit node
  mapping(address => uint256) public mostRecentAssignedRequestIdsPerAuditor;

  // contract that stores audit data (separate from the auditing logic)
  QuantstampAuditData public auditData;

  // contract that stores audit reports on-chain
  QuantstampAuditReportData public reportData;

  // contract that handles policing
  QuantstampAuditPolice public police;

  // contract that stores token escrows of nodes on the network
  QuantstampAuditTokenEscrow public tokenEscrow;

  event LogAuditFinished(
    uint256 requestId,
    address auditor,
    QuantstampAuditData.AuditState auditResult,
    bytes report
  );

  event LogPoliceAuditFinished(
    uint256 requestId,
    address policeNode,
    bytes report,
    bool isVerified
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
  event LogAuditAssignmentError_Understaked(address auditor, uint256 stake);
  event LogAuditAssignmentUpdate_Expired(uint256 requestId, uint256 allowanceBlockNumber);
  event LogClaimRewardsReachedGasLimit(address auditor);

  /* solhint-enable event-name-camelcase */

  event LogAuditQueueIsEmpty();

  event LogPayAuditor(uint256 requestId, address auditor, uint256 amount);
  event LogAuditNodePriceChanged(address auditor, uint256 amount);

  event LogRefund(uint256 requestId, address requestor, uint256 amount);
  event LogRefundInvalidRequestor(uint256 requestId, address requestor);
  event LogRefundInvalidState(uint256 requestId, QuantstampAuditData.AuditState state);
  event LogRefundInvalidFundsLocked(uint256 requestId, uint256 currentBlock, uint256 fundLockEndBlock);

  // the audit queue has elements, but none satisfy the minPrice of the audit node
  // amount corresponds to the current minPrice of the audit node
  event LogAuditNodePriceHigherThanRequests(address auditor, uint256 amount);

  enum AuditAvailabilityState {
    Error,
    Ready,      // an audit is available to be picked up
    Empty,      // there is no audit request in the queue
    Exceeded,   // number of incomplete audit requests is reached the cap
    Underpriced, // all queued audit requests are less than the expected price
    Understaked // the audit node's stake is not large enough to request its min price
  }

  /**
   * @dev The constructor creates an audit contract.
   * @param auditDataAddress The address of an AuditData that stores data used for performing audits.
   * @param reportDataAddress The address of a ReportData that stores audit reports.
   * @param escrowAddress The address of a QuantstampTokenEscrow contract that holds staked deposits of nodes.
   * @param policeAddress The address of a QuantstampAuditPolice that performs report checking.
   */
  constructor (address auditDataAddress, address reportDataAddress, address escrowAddress, address policeAddress) public {
    require(auditDataAddress != address(0));
    require(reportDataAddress != address(0));
    require(escrowAddress != address(0));
    require(policeAddress != address(0));
    auditData = QuantstampAuditData(auditDataAddress);
    reportData = QuantstampAuditReportData(reportDataAddress);
    tokenEscrow = QuantstampAuditTokenEscrow(escrowAddress);
    police = QuantstampAuditPolice(policeAddress);
  }

  /**
   * @dev Allows contract owner to set the lower cap the min audit price.
   * @param amount The amount of wei-QSP.
   */
  function setMinAuditPriceLowerCap(uint256 amount) external onlyOwner {
    minAuditPriceLowerCap = amount;
  }

  /**
   * @dev Allows nodes to stake a deposit. The audit node must approve QuantstampAudit before invoking.
   * @param amount The amount of wei-QSP to deposit.
   */
  function stake(uint256 amount) external returns(bool) {
    // first acquire the tokens approved by the audit node
    require(auditData.token().transferFrom(msg.sender, address(this), amount));
    // use those tokens to approve a transfer in the escrow
    auditData.token().approve(address(tokenEscrow), amount);
    // a "Deposited" event is emitted in TokenEscrow
    tokenEscrow.deposit(msg.sender, amount);
    return true;
  }

  /**
   * @dev Allows audit nodes to retrieve a deposit.
   */
  function unstake() external returns(bool) {
    // the escrow contract ensures that the deposit is not currently locked
    tokenEscrow.withdraw(msg.sender);
    return true;
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
    uint256 refundBlockNumber = auditData.getAuditAssignBlockNumber(requestId).add(auditData.auditTimeoutInBlocks());
    // check that the audit node has not recently started the audit (locking the funds)
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

    // return the funds to the requestor
    uint256 price = auditData.getAuditPrice(requestId);
    emit LogRefund(requestId, requestor, price);
    safeTransferFromDataContract(requestor, price);
    return true;
  }

  /**
   * @dev Submits audit request.
   * @param contractUri Identifier of the resource to audit.
   * @param price The total amount of tokens that will be paid for the audit.
   */
  function requestAudit(string contractUri, uint256 price) public returns(uint256) {
    // it passes HEAD as the existing price, therefore may result in extra gas needed for list iteration
    return requestAuditWithPriceHint(contractUri, price, HEAD);
  }

  /**
   * @dev Submits audit request.
   * @param contractUri Identifier of the resource to audit.
   * @param price The total amount of tokens that will be paid for the audit.
   * @param existingPrice Existing price in the list (price hint allows for optimization that can make insertion O(1)).
   */
  function requestAuditWithPriceHint(string contractUri, uint256 price, uint256 existingPrice) public whenNotPaused returns(uint256) {
    require(price > 0);
    require(price >= minAuditPriceLowerCap);

    // transfer tokens to the data contract
    require(auditData.token().transferFrom(msg.sender, address(auditData), price));
    // store the audit
    uint256 requestId = auditData.addAuditRequest(msg.sender, contractUri, price);

    queueAuditRequest(requestId, existingPrice);

    emit LogAuditRequested(requestId, msg.sender, contractUri, price); // solhint-disable-line not-rely-on-time

    return requestId;
  }

  /**
   * @dev Submits the report and pays the audit node for their work if the audit is completed.
   * @param requestId Unique identifier of the audit request.
   * @param auditResult Result of an audit.
   * @param report a compressed report. TODO, let's document the report format.
   */
  function submitReport(uint256 requestId, QuantstampAuditData.AuditState auditResult, bytes report) public { // solhint-disable-line function-max-lines
    if (QuantstampAuditData.AuditState.Completed != auditResult && QuantstampAuditData.AuditState.Error != auditResult) {
      emit LogReportSubmissionError_InvalidResult(requestId, msg.sender, auditResult);
      return;
    }

    QuantstampAuditData.AuditState auditState = auditData.getAuditState(requestId);
    if (auditState != QuantstampAuditData.AuditState.Assigned) {
      emit LogReportSubmissionError_InvalidState(requestId, msg.sender, auditState);
      return;
    }

    // the sender must be the audit node
    if (msg.sender != auditData.getAuditAuditor(requestId)) {
      emit LogReportSubmissionError_InvalidAuditor(requestId, msg.sender);
      return;
    }

    // remove the requestId from assigned queue
    updateAssignedAudits(requestId);

    // the audit node should not send a report after its allowed period
    uint256 allowanceBlockNumber = auditData.getAuditAssignBlockNumber(requestId) + auditData.auditTimeoutInBlocks();
    if (allowanceBlockNumber < block.number) {
      // update assigned to expired state
      auditData.setAuditState(requestId, QuantstampAuditData.AuditState.Expired);
      emit LogReportSubmissionError_ExpiredAudit(requestId, msg.sender, allowanceBlockNumber);
      return;
    }

    // update the audit information held in this contract
    auditData.setAuditState(requestId, auditResult);
    auditData.setAuditReportBlockNumber(requestId, block.number); // solhint-disable-line not-rely-on-time

    // validate the audit state
    require(isAuditFinished(requestId));

    // store reports on-chain
    reportData.setReport(requestId, report);

    emit LogAuditFinished(requestId, msg.sender, auditResult, report);

    // alert the police to verify the report
    police.assignPoliceToReport(requestId);
    // add the requestId to the pending payments that should be paid to the audit node after policing
    police.addPendingPayment(msg.sender, requestId);
    // pay fee to the police
    if (police.reportProcessingFeePercentage() > 0 && police.numPoliceNodes() > 0) {
      uint256 policeFee = police.collectFee(requestId);
      safeTransferFromDataContract(address(police), policeFee);
      police.splitPayment(policeFee);
    }
  }

  /**
   * @dev Returns the compressed report submitted by the audit node.
   * @param requestId The ID of the audit request.
   */
  function getReport(uint256 requestId) public view returns (bytes) {
    return reportData.getReport(requestId);
  }

  /**
   * @dev Checks whether a given node is a police.
   * @param node The address of the node to be checked.
   * @return true if the target address is a police node.
   */
  function isPoliceNode(address node) public view returns(bool) {
    return police.isPoliceNode(node);
  }

  /**
   * @dev Submits verification of a report by a police node.
   * @param requestId The ID of the audit request.
   * @param report The compressed bytecode representation of the report.
   * @param isVerified Whether the police node's report matches the submitted report.
   *                   If not, the audit node is slashed.
   * @return true if the report was submitted successfully.
   */
  function submitPoliceReport(
    uint256 requestId,
    bytes report,
    bool isVerified) public returns (bool) {
    require(police.isPoliceNode(msg.sender));
    // get the address of the audit node
    address auditNode = auditData.getAuditAuditor(requestId);
    bool hasBeenSubmitted;
    bool slashOccurred;
    uint256 slashAmount;
    // hasBeenSubmitted may be false if the police submission period has ended
    (hasBeenSubmitted, slashOccurred, slashAmount) = police.submitPoliceReport(msg.sender, auditNode, requestId, report, isVerified);
    if (hasBeenSubmitted) {
      emit LogPoliceAuditFinished(requestId, msg.sender, report, isVerified);
    }
    if (slashOccurred) {
      // transfer the audit request price to the police
      uint256 auditPoliceFee = police.collectedFees(requestId);
      uint256 adjustedPrice = auditData.getAuditPrice(requestId).sub(auditPoliceFee);
      safeTransferFromDataContract(address(police), adjustedPrice);

      // divide the adjusted price + slash among police assigned to report
      police.splitPayment(adjustedPrice.add(slashAmount));
    }
    return hasBeenSubmitted;
  }

  /**
   * @dev Determines whether the address (of an audit node) can claim any audit rewards.
   */
  function hasAvailableRewards () public view returns (bool) {
    bool exists;
    uint256 next;
    (exists, next) = police.getNextAvailableReward(msg.sender, HEAD);
    return exists;
  }

  /**
   * @dev Returns the minimum price nodes could set
   */
  function getMinAuditPriceLowerCap() public view returns(uint256) {
    return minAuditPriceLowerCap;
  }

  /**
   * @dev Given a requestId, returns the next pending available reward for the audit node.
   *      This can be used in conjunction with claimReward() if claimRewards fails due to gas limits.
   * @param requestId The ID of the current linked list node
   * @return true if the next reward exists, and the corresponding requestId in the linked list
   */
  function getNextAvailableReward (uint256 requestId) public view returns(bool, uint256) {
    return police.getNextAvailableReward(msg.sender, requestId);
  }

  /**
   * @dev If the policing period has ended without the report being marked invalid,
   *      allow the audit node to claim the audit's reward.
   * @param requestId The ID of the audit request.
   * NOTE: We need this function if claimRewards always fails due to gas limits.
   *       I think this can only happen if the audit node receives many (i.e., hundreds) of audits,
   *       and never calls claimRewards() until much later.
   */
  function claimReward (uint256 requestId) public returns (bool) {
    require(police.canClaimAuditReward(msg.sender, requestId));
    police.setRewardClaimed(msg.sender, requestId);
    transferReward(requestId);
    return true;
  }

  /**
   * @dev Claim all pending rewards for the audit node.
   * @return Returns true if the operation ran to completion, or false if the loop exits due to gas limits.
   */
  function claimRewards () public returns (bool) {
    // Yet another list iteration. Could ignore this check, but makes testing painful.
    require(hasAvailableRewards());
    bool exists;
    uint256 requestId = HEAD;
    uint256 remainingGasBeforeCall;
    uint256 remainingGasAfterCall;
    bool loopExitedDueToGasLimit;
    // This loop occurs here (not in QuantstampAuditPolice) due to requiring the audit price,
    // as otherwise we require more dependencies/mappings in QuantstampAuditPolice.
    while (true) {
      remainingGasBeforeCall = gasleft();
      (exists, requestId) = police.claimNextReward(msg.sender, HEAD);
      if (!exists) {
        break;
      }
      transferReward(requestId);
      remainingGasAfterCall = gasleft();
      // multiplying by 2 to leave a bit of extra leeway, particularly due to the while-loop in claimNextReward
      if (remainingGasAfterCall < remainingGasBeforeCall.sub(remainingGasAfterCall).mul(2)) {
        loopExitedDueToGasLimit = true;
        emit LogClaimRewardsReachedGasLimit(msg.sender);
        break;
      }
    }
    return loopExitedDueToGasLimit;
  }

  /**
   * @dev Returns the total stake deposited by an address.
   * @param addr The address to check.
   */
  function totalStakedFor(address addr) public view returns(uint256) {
    return tokenEscrow.depositsOf(addr);
  }

  /**
   * @dev Returns true if the sender staked enough.
   * @param addr The address to check.
   */
  function hasEnoughStake(address addr) public view returns(bool) {
    return tokenEscrow.hasEnoughStake(addr);
  }

  /**
   * @dev Returns the minimum stake required to be an audit node.
   */
  function getMinAuditStake() public view returns(uint256) {
    return tokenEscrow.minAuditStake();
  }

  /**
   *  @dev Returns the timeout time (in blocks) for any given audit.
   */
  function getAuditTimeoutInBlocks() public view returns(uint256) {
    return auditData.auditTimeoutInBlocks();
  }

  /**
   *  @dev Returns the minimum price for a specific audit node.
   */
  function getMinAuditPrice (address auditor) public view returns(uint256) {
    return auditData.getMinAuditPrice(auditor);
  }

  /**
   * @dev Returns the maximum number of assigned audits for any given audit node.
   */
  function getMaxAssignedRequests() public view returns(uint256) {
    return auditData.maxAssignedRequests();
  }

  /**
   * @dev Determines if there is an audit request available to be picked up by the caller.
   */
  function anyRequestAvailable() public view returns(AuditAvailabilityState) {
    uint256 requestId;

    // check that the audit node's stake is large enough
    if (!hasEnoughStake(msg.sender)) {
      return AuditAvailabilityState.Understaked;
    }

    // there are no audits in the queue
    if (!auditQueueExists()) {
      return AuditAvailabilityState.Empty;
    }

    // check if the audit node's assignment count is not exceeded
    if (assignedRequestCount[msg.sender] >= auditData.maxAssignedRequests()) {
      return AuditAvailabilityState.Exceeded;
    }

    requestId = anyAuditRequestMatchesPrice(auditData.getMinAuditPrice(msg.sender));
    if (requestId == 0) {
      return AuditAvailabilityState.Underpriced;
    }
    return AuditAvailabilityState.Ready;
  }

  /**
   * @dev Returns the next assigned report in a police node's assignment queue.
   * @return true if the list is non-empty, requestId, auditPrice, uri, and policeAssignmentBlockNumber.
   */
  function getNextPoliceAssignment() public view returns (bool, uint256, uint256, string, uint256) {
    return police.getNextPoliceAssignment(msg.sender);
  }

  /**
   * @dev Finds a list of most expensive audits and assigns the oldest one to the audit node.
   */
  /* solhint-disable function-max-lines */
  function getNextAuditRequest() public {
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

    // check if the audit node's assignment is not exceeded
    if (isRequestAvailable == AuditAvailabilityState.Exceeded) {
      emit LogAuditAssignmentError_ExceededMaxAssignedRequests(msg.sender);
      return;
    }

    uint256 minPrice = auditData.getMinAuditPrice(msg.sender);
    require(minPrice >= minAuditPriceLowerCap);

    // check that the audit node has staked enough QSP
    if (isRequestAvailable == AuditAvailabilityState.Understaked) {
      emit LogAuditAssignmentError_Understaked(msg.sender, totalStakedFor(msg.sender));
      return;
    }

    // there are no audits in the queue with a price high enough for the audit node
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

    // lock stake when assigned
    tokenEscrow.lockFunds(msg.sender, block.number.add(auditData.auditTimeoutInBlocks()).add(police.policeTimeoutInBlocks()));

    mostRecentAssignedRequestIdsPerAuditor[msg.sender] = requestId;
    emit LogAuditAssigned(requestId,
      auditData.getAuditAuditor(requestId),
      auditData.getAuditRequestor(requestId),
      auditData.getAuditContractUri(requestId),
      auditData.getAuditPrice(requestId),
      auditData.getAuditRequestBlockNumber(requestId));
  }
  /* solhint-enable function-max-lines */

  /**
   * @dev Allows the audit node to set its minimum price per audit in wei-QSP.
   * @param price The minimum price.
   */
  function setAuditNodePrice(uint256 price) public {
    require(price >= minAuditPriceLowerCap);
    require(price <= auditData.token().totalSupply());
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
   * @dev Given a price, returns the next price from the priceList.
   * @param price A price indicated by a node in priceList.
   * @return The next price in the linked list.
   */
  function getNextPrice(uint256 price) public view returns(uint256) {
    bool exists;
    uint256 next;
    (exists, next) = priceList.getAdjacent(price, NEXT);
    return next;
  }

  /**
   * @dev Given a requestId, returns the next one from assignedAudits.
   * @param requestId The ID of the current linked list node
   * @return next requestId in the linked list
   */
  function getNextAssignedRequest(uint256 requestId) public view returns(uint256) {
    bool exists;
    uint256 next;
    (exists, next) = assignedAudits.getAdjacent(requestId, NEXT);
    return next;
  }

  /**
   * @dev Returns the audit request most recently assigned to msg.sender.
   * @return A tuple (requestId, audit_uri, audit_price, request_block_number).
   */
  function myMostRecentAssignedAudit() public view returns(
    uint256, // requestId
    address, // requestor
    string,  // contract uri
    uint256, // price
    uint256  // request block number
  ) {
    uint256 requestId = mostRecentAssignedRequestIdsPerAuditor[msg.sender];
    return (
      requestId,
      auditData.getAuditRequestor(requestId),
      auditData.getAuditContractUri(requestId),
      auditData.getAuditPrice(requestId),
      auditData.getAuditRequestBlockNumber(requestId)
    );
  }

  /**
   * @dev Given a price and a requestId, the function returns the next requestId with the same price.
   * Return 0, provided the given price does not exist in auditsByPrice.
   * @param price The price value of the current bucket.
   * @param requestId Unique Id of a requested audit.
   * @return The next requestId with the same price.
   */
  function getNextAuditByPrice(uint256 price, uint256 requestId) public view returns(uint256) {
    bool exists;
    uint256 next;
    (exists, next) = auditsByPrice[price].getAdjacent(requestId, NEXT);
    return next;
  }

  /**
   * @dev Given a price finds where it should be placed to build a sorted list.
   * @return next First existing price higher than the passed price.
   */
  function findPrecedingPrice(uint256 price) public view returns(uint256) {
    return priceList.getSortedSpot(HEAD, price, NEXT);
  }

  /**
   * @dev Given a requestId, the function removes it from the list of audits and decreases the number of assigned
   * audits of the associated audit node.
   * @param requestId Unique ID of a requested audit.
   */
  function updateAssignedAudits(uint256 requestId) internal {
    assignedAudits.remove(requestId);
    assignedRequestCount[auditData.getAuditAuditor(requestId)] =
      assignedRequestCount[auditData.getAuditAuditor(requestId)].sub(1);
  }

  /**
   * @dev Checks if the list of audits has any elements.
   */
  function auditQueueExists() internal view returns(bool) {
    return priceList.listExists();
  }

  /**
   * @dev Adds an audit request to the queue.
   * @param requestId Request ID.
   * @param existingPrice The price of an existing audit in the queue (makes insertion O(1)).
   */
  function queueAuditRequest(uint256 requestId, uint256 existingPrice) internal {
    uint256 price = auditData.getAuditPrice(requestId);
    if (!priceList.nodeExists(price)) {
      uint256 priceHint = priceList.nodeExists(existingPrice) ? existingPrice : HEAD;
      // if a price bucket doesn't exist, create it next to an existing one
      priceList.insert(priceList.getSortedSpot(priceHint, price, NEXT), price, PREV);
    }
    // push to the tail
    auditsByPrice[price].push(requestId, PREV);
  }

  /**
   * @dev Evaluates if there is an audit price >= minPrice.
   * Note that there should not be any audit with price as 0.
   * @param minPrice The minimum audit price.
   * @return The requestId of an audit adhering to the minPrice, or 0 if no such audit exists.
   */
  function anyAuditRequestMatchesPrice(uint256 minPrice) internal view returns(uint256) {
    bool priceExists;
    uint256 price;
    uint256 requestId;

    // picks the tail of price buckets
    (priceExists, price) = priceList.getAdjacent(HEAD, PREV);
    if (price < minPrice) {
      return 0;
    }
    requestId = getNextAuditByPrice(price, HEAD);
    return requestId;
  }

  /**
   * @dev Finds a list of most expensive audits and returns the oldest one that has a price >= minPrice.
   * @param minPrice The minimum audit price.
   */
  function dequeueAuditRequest(uint256 minPrice) internal returns(uint256) {

    uint256 requestId;
    uint256 price;

    // picks the tail of price buckets
    // TODO seems the following statement is redundantly called from getNextAuditRequest. If this is the only place
    // to call dequeueAuditRequest, then removing the following line saves gas, but leaves dequeueAuditRequest
    // unsafe for further extension.
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
   * @dev Removes an element from the list.
   * @param requestId The Id of the request to be removed.
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
   * @dev Internal helper function to perform the transfer of rewards.
   * @param requestId The ID of the audit request.
   */
  function transferReward (uint256 requestId) internal {
    uint256 auditPoliceFee = police.collectedFees(requestId);
    uint256 auditorPayment = auditData.getAuditPrice(requestId).sub(auditPoliceFee);
    safeTransferFromDataContract(msg.sender, auditorPayment);
    emit LogPayAuditor(requestId, msg.sender, auditorPayment);
  }

  /**
   * @dev Used to transfer funds stored in the data contract to a given address.
   * @param _to The address to transfer funds.
   * @param amount The number of wei-QSP to be transferred.
   */
  function safeTransferFromDataContract(address _to, uint256 amount) internal {
    auditData.approveWhitelisted(amount);
    require(auditData.token().transferFrom(address(auditData), _to, amount));
  }
}
