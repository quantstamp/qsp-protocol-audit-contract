pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";
import "./LinkedListLib.sol";

// TODO (QSP-833): salary and taxing
contract QuantstampAuditPolice is Whitelist {
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
    VALID
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

  // pointer to the address that was last assigned to a report
  address private lastAssignedPoliceNode = address(HEAD);

  // maps each police node to the IDs of reports it should check
  mapping(address => LinkedListLib.LinkedList) internal assignedReports;

  // maps request IDs to police timeouts
  mapping(uint256 => uint256) public policeTimeouts;

  // maps request IDs to reports submitted by police nodes
  mapping(uint256 => mapping(address => bytes)) public policeReports;

  // maps request IDs to whether they have been verified by the police
  mapping(uint256 => PoliceReportState) public verifiedReports;

  // maps request IDs to whether they have been claimed by the submitter
  mapping(uint256 => bool) public rewardHasBeenClaimed;

  // tracks the total number of reports ever assigned to a police node
  mapping(address => uint256) public totalReportsAssigned;

  // tracks the total number of reports ever checked by a police node
  mapping(address => uint256) public totalReportsChecked;

  /**
   * @dev Assigns police nodes to a submitted report
   * @param requestId The ID of the audit request.
   */
  function assignPoliceToReport(uint256 requestId) public onlyWhitelisted {
    // set the timeout for police reports
    policeTimeouts[requestId] = block.number + policeTimeoutInBlocks;
    // if there is not enough police nodes, this avoids assigning the same node twice
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
        totalReportsAssigned[lastAssignedPoliceNode] = totalReportsAssigned[lastAssignedPoliceNode] + 1;
        numToAssign = numToAssign - 1;
      }
    }
  }

  // cleans the list of assignments to a given police node
  function removeExpiredAssignments (address policeNode) internal {
    if (assignedReports[policeNode].listExists()) {
      bool exists = true;
      uint256 potentialExpiredRequestId;
      while (exists) {
        (exists, potentialExpiredRequestId) = assignedReports[policeNode].getAdjacent(HEAD, NEXT);
        if (policeTimeouts[potentialExpiredRequestId] < block.number) {
          assignedReports[policeNode].remove(potentialExpiredRequestId);
        }
        else {
          break;
        }
      }
    }
  }

  /**
   * @dev Submits verification of a report by a police node.
   * @param policeNode The address of the police node.
   * @param requestId The ID of the audit request.
   * @param report The compressed bytecode representation of the report.
   * @param isVerified Whether the police node's report matches the submitted report.
   *                   If not, the auditor is slashed.
   * @return true if the report was successfully submitted
   */
  function submitPoliceReport(
    address policeNode,
    uint256 requestId,
    bytes report,
    bool isVerified) public onlyWhitelisted returns (bool) {
    if (policeTimeouts[requestId] < block.number) {
      emit PoliceSubmissionPeriodExceeded(requestId, policeTimeouts[requestId], block.number);
      return false;
    }
    // remove expired assignments
    removeExpiredAssignments(policeNode);
    // the police node is assigned to the report
    require(isAssigned(requestId, policeNode));
    // remove the report from the assignments to the node
    assignedReports[policeNode].remove(requestId);
    // increment the number of reports checked by the police node
    totalReportsChecked[policeNode] = totalReportsChecked[policeNode] + 1;
    // store the report
    policeReports[requestId][policeNode] = report;
    // emit an event
    PoliceReportState state;
    if (isVerified) {
      state = PoliceReportState.VALID;
    }
    else{
      state = PoliceReportState.INVALID;
    }
    emit PoliceReportSubmitted(policeNode, requestId, state);
    // the report was already marked invalid by a different police node
    if (verifiedReports[requestId] == PoliceReportState.INVALID) {
      return;
    }
    if (isVerified) {
      verifiedReports[requestId] = PoliceReportState.VALID;
    }
    else {
      verifiedReports[requestId] = PoliceReportState.INVALID;
      // TODO (QSP-832): slash the auditor, be careful of double slash logic
    }
    return true;
  }

  /**
   * @dev Determines whether an auditor is allowed by the police to claim an audit.
   *      This function also ensures double payment does not occur.
   * @param requestId The ID of the requested audit.
   */
  function canBeClaimed (uint256 requestId) public onlyWhitelisted returns (bool) {
    // the police did not invalidate the report
    require(verifiedReports[requestId] != PoliceReportState.INVALID);
    // the policing period has ended for the report
    require(policeTimeouts[requestId] < block.number);
    // the reward has not already been claimed
    require(!rewardHasBeenClaimed[requestId]);
    // set the reward to claimed, to avoid double payment
    rewardHasBeenClaimed[requestId] = true;
    return true;
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
      }
      else {
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
   * @dev Returns true if a node is whitelisted
   * @param node Node to check.
   */
  function isPoliceNode(address node) public view returns(bool) {
    return policeList.nodeExists(uint256(node));
  }

  /**
   * @dev Adds an address to the police
   * @param addr address
   * @return true if the address was added to the whitelist
   */
  function addPoliceNode(address addr) public onlyOwner returns(bool success) {
    if (policeList.insert(HEAD, uint256(addr), PREV)) {
      numPoliceNodes = numPoliceNodes.add(1);
      emit PoliceNodeAdded(addr);
      success = true;
    }
  }

  /**
   * @dev Removes an address from the whitelist linked-list
   * @param addr address
   * @return true if the address was removed from the whitelist
   */
  function removePoliceNode(address addr) public onlyOwner returns(bool success) {
    // if lastAssignedPoliceNode is addr, need to move the pointer
    bool exists;
    uint256 next;
    if(lastAssignedPoliceNode == addr) {
      (exists, next) = policeList.getAdjacent(uint256(addr), NEXT);
      lastAssignedPoliceNode = address(next);
    }

    if (policeList.remove(uint256(addr)) != 0) {
      numPoliceNodes = numPoliceNodes.sub(1);
      emit PoliceNodeRemoved(addr);
      success = true;
    }
  }

  /**
   * @dev Given a whitelisted address, returns the next address from the whitelist
   * @param addr address
   * @return next address of the given param
   */
  function getNextPoliceNode(address addr) public view returns(address) {
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
}
