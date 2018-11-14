pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";
import "./LinkedListLib.sol";


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
  uint256 numPoliceNodes = 0;

  // the number of police nodes assigned to each report
  uint256 policeNodesPerReport = 3;

  // the number of blocks the police have to verify a report
  uint256 public policeTimeoutInBlocks = 75;

  event PoliceNodeAdded(address addr);
  event PoliceNodeRemoved(address addr);
  // TODO: we may want these parameters indexed
  event PoliceNodeAssignedToReport(address policeNode, uint256 requestId);
  event PoliceReportSubmitted(address policeNode, uint256 requestId, PoliceReportState reportState);
  // TODO create more events
  // TODO salary

  // pointer to the address that was last assigned to a report
  address lastAssignedPoliceNode = address(HEAD);

  // maps each police nodes to the IDs of reports it should check
  mapping(address => LinkedListLib.LinkedList) internal assignedReports;

  // maps request IDs to police timeouts
  mapping(uint256 => uint256) public policeTimeouts;

  // maps request IDs to reports submitted by police nodes
  mapping(uint256 => mapping(address => bytes)) public policeReports;

  // maps request IDs to reports to whether they have been verified by the police
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
    address policeNode = getNextPoliceNode(lastAssignedPoliceNode);
    while (numToAssign > 0) {
      if (policeNode != address(0)) {
        // push the request ID to the tail of the assignment list for the police node
        assignedReports[policeNode].push(requestId, PREV);
        emit PoliceNodeAssignedToReport(policeNode, requestId);
        totalReportsAssigned[policeNode] = totalReportsAssigned[policeNode] + 1;
        numToAssign = numToAssign - 1;
      }
      policeNode = getNextPoliceNode(policeNode);
    }
  }

  // cleans the list of assignments to a given police node
  function removeExpiredAssignments (address policeNode) internal {
    if (assignedReports[policeNode].listExists()) {
      bool exists = true;
      uint256 potentialExpiredRequestId;
      uint256 allowanceBlockNumber;
      while(exists) {
        (exists, potentialExpiredRequestId) = assignedReports[policeNode].getAdjacent(HEAD, NEXT);
        allowanceBlockNumber = policeTimeouts[potentialExpiredRequestId] + policeTimeoutInBlocks;
        if (allowanceBlockNumber < block.number) {
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
   */
  function submitPoliceReport(
    address policeNode,
    uint256 requestId,
    bytes report,
    bool isVerified) public onlyWhitelisted {
    // remove expired assignments
    removeExpiredAssignments(policeNode);
    // the police node is assigned to the report
    require(assignedReports[policeNode].nodeExists(requestId));
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
      // TODO: slash the auditor
      require(false);
    }
  }

  /**
   * @dev Determines whether an auditor is allowed by the police to claim an audit.
   * @param requestId The ID of the requested audit.
   */
  function canBeClaimed (uint256 requestId) public onlyWhitelisted returns (bool) {
    // the police did not invalidate the report
    require(verifiedReports[requestId] != PoliceReportState.INVALID);
    // the policing period has ended for the report
    require(policeTimeouts[requestId] < block.number);
    // the reward has not already been claimed
    require(!rewardHasBeenClaimed[requestId]);
    // set the
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
    uint256 allowanceBlockNumber;
    (exists, requestId) = assignedReports[policeNode].getAdjacent(HEAD, NEXT);
    // if the head of the list is an expired assignments, try to find a current one
    while (exists) {
      allowanceBlockNumber = policeTimeouts[requestId] + policeTimeoutInBlocks;
      if (allowanceBlockNumber < block.number) {
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
}
