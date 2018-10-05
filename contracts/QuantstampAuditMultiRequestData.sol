pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";


contract QuantstampAuditMultiRequestData is Whitelist {

  // constants used by LinkedListLib
  uint256 constant internal NULL = 0;
  uint256 constant internal HEAD = 0;
  bool constant internal PREV = false;
  bool constant internal NEXT = true;

  // As a multirequest consists of requests, its id can be mapped to a series of integers representing
  // associated requests. The start and end are inclusive.
  struct MultiRequest {
    address requester;
    uint256 firstRequestId;
    uint256 lastRequestId;
    address registrar;
  }

  // mapping from multiRequestID to a range of generated individual requestIds
  mapping(uint256 => MultiRequest) public multiRequests;
  // mapping from individual audit to an associated multiRequestId
  mapping(uint256 => uint256) public requestIdToMultiRequestId;
  // MultiRequestId starts from 1
  uint256 private multiRequestIdCounter;
  // A map from multiRequestIDs to auditors assigned an audit. Note that the time complexity of accessing
  // a random node in the linked-list implemented in LinkedListLib.LinkedList, i.e., LinkedListLib.LinkedList.getNode
  // is O(1) instead of O(n).
  mapping(uint256 => mapping(address => bool)) internal multiRequestsAssignedToAuditor;

  /**
   * @dev The constructor creates a multirequest audit contract.
   */
  constructor () public {}

  function addMultiRequest(address requester, uint256 firstRequestId, uint256 lastRequestId, address registrar) external onlyWhitelisted returns(uint256) {
    multiRequests[++multiRequestIdCounter] = MultiRequest(requester, firstRequestId, lastRequestId, registrar);
    return multiRequestIdCounter;
  }

  function setMultiRequestRequester(uint256 multiRequestId, address requester) external onlyWhitelisted {
    multiRequests[multiRequestId].requester = requester;
  }

  function getMultiRequestRequester(uint256 multiRequestId) external view returns(address) {
    return multiRequests[multiRequestId].requester;
  }

  function setMultiRequestFirstRequestId(uint256 multiRequestId, uint256 firstRequestId) external onlyWhitelisted {
    multiRequests[multiRequestId].firstRequestId = firstRequestId;
  }

  function getMultiRequestFirstRequestId(uint256 multiRequestId) external view returns(uint256) {
    return multiRequests[multiRequestId].firstRequestId;
  }

  function setMultiRequestLastRequestId(uint256 multiRequestId, uint256 lastRequestId) external onlyWhitelisted {
    multiRequests[multiRequestId].lastRequestId = lastRequestId;
  }

  function getMultiRequestLastRequestId(uint256 multiRequestId) external view returns(uint256) {
    return multiRequests[multiRequestId].lastRequestId;
  }

  function setMultiRequestRegistrar(uint256 multiRequestId, address registrar) external onlyWhitelisted {
    multiRequests[multiRequestId].registrar = registrar;
  }

  function getMultiRequestRegistrar(uint256 multiRequestId) external view returns(address) {
    return multiRequests[multiRequestId].registrar;
  }

  function setRequestIdToMultiRequestId(uint256 requestId, uint256 multiRequestId) external onlyWhitelisted {
    requestIdToMultiRequestId[requestId] = multiRequestId;
  }

  function getMultiRequestIdGivenRequestId(uint256 requestId) external view returns(uint256) {
    return requestIdToMultiRequestId[requestId];
  }

  function addAuditorToMultiRequestAssignment(uint256 multiRequestId, address auditor) external onlyWhitelisted {
    multiRequestsAssignedToAuditor[multiRequestId][auditor] = true;
  }

  function removeAuditorFromMultiRequestAssignment(uint256 multiRequestId, address auditor) external onlyWhitelisted {
    delete multiRequestsAssignedToAuditor[multiRequestId][auditor];
  }

  function existsAuditorFromMultiRequestAssignment(uint256 multiRequestId, address auditor) external view returns(bool) {
    return multiRequestsAssignedToAuditor[multiRequestId][auditor];
  }

}
