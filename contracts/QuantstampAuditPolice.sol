pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";
import "./LinkedListLib.sol";
import "./QuantstampAuditData.sol";
import "./QuantstampAuditTokenEscrow.sol";


contract QuantstampAuditPolice is Whitelist { // solhint-disable max-states-count
  using SafeMath for uint256;
  using LinkedListLib for LinkedListLib.LinkedList;

  // constants used by LinkedListLib
  uint256 constant internal NULL = 0;
  uint256 constant internal HEAD = 0;
  bool constant internal PREV = false;
  bool constant internal NEXT = true;

  enum PoliceReportState {
    UNVERIFIED,
    INVALID,
    VALID,
    EXPIRED
  }

  // whitelisted police nodes
  LinkedListLib.LinkedList internal policeList;

  // the total number of police nodes
  uint256 public numPoliceNodes = 0;

  // the number of police nodes assigned to each report
  uint256 public policeNodesPerReport = 3;

  // the number of blocks the police have to verify a report
  uint256 public policeTimeoutInBlocks = 75;

  event PoliceNodeAdded(address addr);
  event PoliceNodeRemoved(address addr);
  // TODO: we may want these parameters indexed
  event PoliceNodeAssignedToReport(address policeNode, uint256 requestId);
  event PoliceReportSubmitted(address policeNode, uint256 requestId, PoliceReportState reportState);
  event PoliceSubmissionPeriodExceeded(uint256 requestId, uint256 timeoutBlock, uint256 currentBlock);
  event PoliceFeesCollected(uint256 requestId, uint256 fee);
  event PoliceFeesClaimed(address policeNode, uint256 fee);

  // pointer to the police node that was last assigned to a report
  address private lastAssignedPoliceNode = address(HEAD);

  // maps each police node to the IDs of reports it should check
  mapping(address => LinkedListLib.LinkedList) internal assignedReports;

  // maps each audit node to the IDs of reports that are pending police approval for payment
  mapping(address => LinkedListLib.LinkedList) internal pendingPayments;

  // maps request IDs to police timeouts
  mapping(uint256 => uint256) public policeTimeouts;

  // maps request IDs to reports submitted by police nodes
  mapping(uint256 => mapping(address => bytes)) public policeReports;

  // maps request IDs to whether they have been verified by the police
  mapping(uint256 => PoliceReportState) public verifiedReports;

  // maps request IDs to whether their reward has been claimed by the submitter
  mapping(uint256 => bool) public rewardHasBeenClaimed;

  // the block in which each police node was last paid
  mapping(address => uint256) public policeNodeLastPaidBlock;

  // tracks the total number of reports assigned to a police node
  mapping(address => uint256) public reportsAssigned;

  // tracks the total number of reports checked by a police node
  mapping(address => uint256) public reportsChecked;

  // the collected fees for each report
  mapping(uint256 => uint256) public collectedFees;

  // the threshold of checks/assigned in the range [0-100]
  // that a police node must meet in order to receive their fees
  uint256 public policeCheckPercentageForPayment = 50;

  // percentage in the range of [0-100] of each audit price that is deducted and used to pay police fees
  // this is only deducted once per report, regardless of the number of police nodes assigned to it
  uint256 public reportProcessingFeePercentage = 5;

  // for every block mined, a police node earns this much wei-QSP in fees
  uint256 public policeFeesPerBlock = 0;

  // contract that stores audit data (separate from the auditing logic)
  QuantstampAuditData public auditData;

   // contract that stores token escrows of nodes on the network
  QuantstampAuditTokenEscrow public tokenEscrow;

  /**
   * @dev The constructor creates a police contract.
   * @param auditDataAddress The address of an AuditData that stores data used for performing audits.
   * @param escrowAddress The address of a QuantstampTokenEscrow contract that holds staked deposits of nodes.
   */
  constructor (address auditDataAddress, address escrowAddress) public {
    require(auditDataAddress != address(0));
    require(escrowAddress != address(0));
    auditData = QuantstampAuditData(auditDataAddress);
    tokenEscrow = QuantstampAuditTokenEscrow(escrowAddress);
  }

  /**
   * @dev Assigns police nodes to a submitted report
   * @param requestId The ID of the audit request.
   */
  function assignPoliceToReport(uint256 requestId) public onlyWhitelisted {
    // set the timeout for police reports
    policeTimeouts[requestId] = block.number + policeTimeoutInBlocks;
    // if there are not enough police nodes, this avoids assigning the same node twice
    uint256 numToAssign = policeNodesPerReport;
    if (numPoliceNodes < numToAssign) {
      numToAssign = numPoliceNodes;
    }
    while (numToAssign > 0) {
      lastAssignedPoliceNode = getNextPoliceNode(lastAssignedPoliceNode);
      if (lastAssignedPoliceNode != address(0)) {
        // push the request ID to the tail of the assignment list for the police node
        assignedReports[lastAssignedPoliceNode].push(requestId, PREV);
        emit PoliceNodeAssignedToReport(lastAssignedPoliceNode, requestId);
        reportsAssigned[lastAssignedPoliceNode] = reportsAssigned[lastAssignedPoliceNode] + 1;
        numToAssign = numToAssign - 1;
      }
    }
  }

  /**
   * @dev Assigns police nodes to a submitted report
   * @param auditor The audit node that submitted the report.
   * @param requestId The ID of the audit request.
   */
  function addPendingPayment(address auditor, uint256 requestId) public onlyWhitelisted {
    pendingPayments[auditor].push(requestId, PREV);
  }

  /**
   * @dev Collects the police fee for checking a report.
   * @param requestId The ID of the audit request.
   * @param fee The audit policing fee.
   */
  function collectFee(uint256 requestId, uint256 fee) public onlyWhitelisted returns (uint256) {
    require(auditData.token().transferFrom(msg.sender, address(this), fee));
    // the collected fee needs to be stored in a map since the owner could change the fee percentage
    collectedFees[requestId] = fee;
    emit PoliceFeesCollected(requestId, fee);
  }

  /**
   * @dev Submits verification of a report by a police node.
   * @param policeNode The address of the police node.
   * @param auditNode The address of the audit node.
   * @param requestId The ID of the audit request.
   * @param report The compressed bytecode representation of the report.
   * @param isVerified Whether the police node's report matches the submitted report.
   *                   If not, the auditor is slashed.
   * @return true if the report was successfully submitted.
   */
  function submitPoliceReport(
    address policeNode,
    address auditNode,
    uint256 requestId,
    bytes report,
    bool isVerified) public onlyWhitelisted returns (bool) {
    // remove expired assignments
    bool hasRemovedCurrentId = removeExpiredAssignments(policeNode, requestId);
    // if the current request has timed out, return
    if (hasRemovedCurrentId) {
      emit PoliceSubmissionPeriodExceeded(requestId, policeTimeouts[requestId], block.number);
      return false;
    }
    // the police node is assigned to the report
    require(isAssigned(requestId, policeNode));

    // remove the report from the assignments to the node
    assignedReports[policeNode].remove(requestId);
    // increment the number of reports checked by the police node
    reportsChecked[policeNode] = reportsChecked[policeNode] + 1;
    // store the report
    policeReports[requestId][policeNode] = report;
    // emit an event
    PoliceReportState state;
    if (isVerified) {
      state = PoliceReportState.VALID;
    } else {
      state = PoliceReportState.INVALID;
    }
    emit PoliceReportSubmitted(policeNode, requestId, state);
    // the report was already marked invalid by a different police node
    if (verifiedReports[requestId] == PoliceReportState.INVALID) {
      return true;
    } else {
      verifiedReports[requestId] = state;
    }
    if (!isVerified) {
      verifiedReports[requestId] = PoliceReportState.INVALID;
      pendingPayments[auditNode].remove(requestId);
      // TODO (QSP-832): slash the auditor, be careful of double slash logic
    }
    return true;
  }

  /**
   * @dev Determines whether an audit node is allowed by the police to claim an audit.
   * @param auditNode The address of the audit node.
   * @param requestId The ID of the requested audit.
   */
  function canClaimAuditReward (address auditNode, uint256 requestId) public view returns (bool) {
    // NOTE: can't use requires here, as claimNextReward needs to iterate the full list
    return
      // the report is in the pending payments list for the auditor
      pendingPayments[auditNode].nodeExists(requestId) &&
      // the policing period has ended for the report
      policeTimeouts[requestId] < block.number &&
      // the police did not invalidate the report
      verifiedReports[requestId] != PoliceReportState.INVALID &&
      // the policing period has ended for the report
      policeTimeouts[requestId] < block.number &&
      // the reward has not already been claimed
      !rewardHasBeenClaimed[requestId];
  }

  /**
   * @dev Determines whether an audit node has any pending rewards available.
   * @param auditNode The address of the audit node.
   */
  function hasAvailableRewards (address auditNode) public view returns (bool) {
    bool exists;
    uint256 requestId = HEAD;
    (exists, requestId) = pendingPayments[auditNode].getAdjacent(HEAD, NEXT);
    // NOTE: Do NOT short circuit this list based on timeouts.
    // The ordering may be broken if the owner changes the timeouts.
    while (exists && requestId != HEAD) {
      if (canClaimAuditReward(auditNode, requestId)) {
        return true;
      }
      (exists, requestId) = pendingPayments[auditNode].getAdjacent(requestId, NEXT);
    }
    return false;
  }

  /**
   * @dev Sets the reward as claimed after checking that it can be claimed.
   *      This function also ensures double payment does not occur.
   * @param auditNode The address of the audit node.
   * @param requestId The ID of the requested audit.
   */
  function setRewardClaimed (address auditNode, uint256 requestId) public onlyWhitelisted returns (bool) {
    // set the reward to claimed, to avoid double payment
    rewardHasBeenClaimed[requestId] = true;
    pendingPayments[auditNode].remove(requestId);
    // if it is possible to claim yet the state is UNVERIFIED, mark EXPIRED
    if (verifiedReports[requestId] == PoliceReportState.UNVERIFIED) {
      verifiedReports[requestId] = PoliceReportState.EXPIRED;
    }
    return true;
  }

  /**
   * @dev Selects the next ID to be rewarded.
   * @param auditNode The address of the audit node.
   * @param requestId The previous claimed requestId (initially set to HEAD).
   * @return True if another reward exists, and the request ID.
   */
  function claimNextReward (address auditNode, uint256 requestId) public onlyWhitelisted returns (bool, uint256) {
    bool exists;
    (exists, requestId) = pendingPayments[auditNode].getAdjacent(HEAD, NEXT);
    // NOTE: Do NOT short circuit this list based on timeouts.
    // The ordering may be broken if the owner changes the timeouts.
    while (exists && requestId != HEAD) {
      if (canClaimAuditReward(auditNode, requestId)) {
        setRewardClaimed(auditNode, requestId);
        return (true, requestId);
      }
      (exists, requestId) = pendingPayments[auditNode].getAdjacent(requestId, NEXT);
    }
    return (false, 0);
  }

  /**
   * @dev Gets the next assigned report to the police node.
   * @param policeNode The address of the police node.
   */
  function getNextPoliceAssignment(address policeNode) public view returns (bool, uint256) {
    bool exists;
    uint256 requestId;
    (exists, requestId) = assignedReports[policeNode].getAdjacent(HEAD, NEXT);
    // if the head of the list is an expired assignment, try to find a current one
    while (exists && requestId != HEAD) {
      if (policeTimeouts[requestId] < block.number) {
        (exists, requestId) = assignedReports[policeNode].getAdjacent(requestId, NEXT);
      } else {
        return (exists, requestId);
      }
    }
    return (false, 0);
  }

  /**
   * @dev Sets the number of police nodes that should check each report.
   * @param numPolice The number of police.
   */
  function setPoliceNodesPerReport(uint256 numPolice) public onlyOwner {
    policeNodesPerReport = numPolice;
  }

  /**
   * @dev Sets the police timeout.
   * @param numBlocks The number of blocks for the timeout.
   */
  function setPoliceTimeoutInBlocks(uint256 numBlocks) public onlyOwner {
    policeTimeoutInBlocks = numBlocks;
  }

  /**
   * @dev Sets the report processing fee percentage.
   * @param percentage The percentage in the range of [0-100].
   */
  function setReportProcessingFeePercentage(uint256 percentage) public onlyOwner {
    reportProcessingFeePercentage = percentage;
  }

  /**
   * @dev Sets the police check percentage for payment.
   * @param percentage The percentage in the range of [0-100].
   */
  function setPoliceCheckPercentageForPayment(uint256 percentage) public onlyOwner {
    policeCheckPercentageForPayment = percentage;
  }

  /**
   * @dev Sets police fees per block.
   * @param fee The fee in wei-QSP.
   */
  function setPoliceFeesPerBlock(uint256 fee) public onlyOwner {
    address policeNode = getNextPoliceNode(address(HEAD));
    while (uint256(policeNode) != NULL) {
      // pay out any outstanding fees to the police node
      transferPoliceFees(policeNode);
      policeNode = getNextPoliceNode(policeNode);
    }
    policeFeesPerBlock = fee;
  }

  /**
   * @dev Returns true if a node is whitelisted
   * @param node Node to check.
   */
  function isPoliceNode(address node) public view returns (bool) {
    return policeList.nodeExists(uint256(node));
  }

  /**
   * @dev Adds an address to the police
   * @param addr address
   * @return true if the address was added to the whitelist
   */
  function addPoliceNode(address addr) public onlyOwner returns (bool success) {
    if (policeList.insert(HEAD, uint256(addr), PREV)) {
      numPoliceNodes = numPoliceNodes.add(1);
      policeNodeLastPaidBlock[addr] = block.number;

      emit PoliceNodeAdded(addr);
      success = true;
    }
  }

  function getPoliceFee(uint256 auditPrice) public view returns (uint256) {
    return auditPrice.mul(reportProcessingFeePercentage).div(100);
  }

  /**
   * @dev Gets the amount of fees owed to the police node
   * @param addr The address of the police node
   */
  function getUnpaidFees(address addr) public view returns (uint256) {
    require(policeNodeLastPaidBlock[addr] != 0);
    return (block.number - policeNodeLastPaidBlock[addr]) * policeFeesPerBlock;
  }

  /**
   * @dev Determines whether the police node meets the report check requirements.
   *      If no reports were assigned, defaults to true.
   * @dev NOTE: if there are assigned reports that have not been checked but are not expired,
   *            this still counts against the audit node. As such, we should not have
   *            policeCheckPercentageForPayment set *too* high early on.
   * @param addr The address of the police node
   */
  function policeNodeMeetsCheckThreshold(address addr) public view returns (bool) {
    if (reportsAssigned[addr] > 0) {
      uint256 percentChecked = reportsChecked[addr].mul(100).div(reportsAssigned[addr]);
      return percentChecked >= policeCheckPercentageForPayment;
    }
    return true;
  }

  /**
   * @dev Claim outstanding police fees for a given report.
   * @param policeNode The address of the police node that wishes to collect fees.
   */
  function claimPoliceFees(address policeNode) public onlyWhitelisted returns (bool) {
    require(isPoliceNode(policeNode));
    require(transferPoliceFees(policeNode));
  }

  /**
   * @dev Removes an address from the whitelist linked-list
   * @param addr address
   * @return true if the address was removed from the whitelist
   */
  function removePoliceNode(address addr) public onlyOwner returns (bool success) {
    // if lastAssignedPoliceNode is addr, need to move the pointer
    bool exists;
    uint256 next;
    if (lastAssignedPoliceNode == addr) {
      (exists, next) = policeList.getAdjacent(uint256(addr), NEXT);
      lastAssignedPoliceNode = address(next);
    }

    if (policeList.remove(uint256(addr)) != NULL) {
      numPoliceNodes = numPoliceNodes.sub(1);

      // pay out any outstanding fees to the police node
      transferPoliceFees(addr);

      // zero out all associated state variables; otherwise could be problematic if re-adding nodes
      delete policeNodeLastPaidBlock[addr];
      delete reportsAssigned[addr];
      delete reportsChecked[addr];

      emit PoliceNodeRemoved(addr);
      success = true;
    }
  }

  /**
   * @dev Given a whitelisted address, returns the next address from the whitelist
   * @param addr address
   * @return next address of the given param
   */
  function getNextPoliceNode(address addr) public view returns (address) {
    bool exists;
    uint256 next;
    (exists, next) = policeList.getAdjacent(uint256(addr), NEXT);
    return address(next);
  }

  function getPoliceReport(uint256 requestId, address policeAddr) public view returns (bytes) {
    return policeReports[requestId][policeAddr];
  }

  function isAssigned(uint256 requestId, address policeAddr) public view returns (bool) {
    return assignedReports[policeAddr].nodeExists(requestId);
  }

  /**
   * @dev Helper function to transfer police fees.
   *      Marked as internal but called from both onlyWhitelisted and onlyOwner functions.
   * @param addr The address to transfer the fees.
   */
  function transferPoliceFees(address addr) internal returns (bool) {
    uint256 unpaidFees = getUnpaidFees(addr);
    policeNodeLastPaidBlock[addr] = block.number;

    if (unpaidFees > 0 && policeNodeMeetsCheckThreshold(addr)) {
      require(auditData.token().transfer(addr, unpaidFees));
      emit PoliceFeesClaimed(addr, unpaidFees);
      return true;
    }
    return false;
  }

  /**
   * Cleans the list of assignments to a given police node.
   * @param policeNode The address of the police node.
   * @param requestId The ID of the audit request.
   * @return true if the current request ID gets removed during cleanup.
   */
  function removeExpiredAssignments (address policeNode, uint256 requestId) internal returns (bool) {
    bool hasRemovedCurrentId = false;
    bool exists;
    uint256 potentialExpiredRequestId;
    (exists, potentialExpiredRequestId) = assignedReports[policeNode].getAdjacent(HEAD, NEXT);
    // NOTE: Do NOT short circuit this list based on timeouts.
    // The ordering may be broken if the owner changes the timeouts.
    while (exists && potentialExpiredRequestId != HEAD) {
      if (policeTimeouts[potentialExpiredRequestId] < block.number) {
        assignedReports[policeNode].remove(potentialExpiredRequestId);
        if (potentialExpiredRequestId == requestId) {
          hasRemovedCurrentId = true;
        }
      }
      (exists, potentialExpiredRequestId) = assignedReports[policeNode].getAdjacent(potentialExpiredRequestId, NEXT);
    }
    return hasRemovedCurrentId;
  }
}
