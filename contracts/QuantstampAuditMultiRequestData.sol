pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";


contract QuantstampAuditMultiRequestData is Whitelist {

  // As a multirequest consists of requests. The first and last requestId are inclusive.
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
  // A map from multiRequestIDs to auditors assigned an audit.
  mapping(uint256 => mapping(address => bool)) internal multiRequestsAssignedToAuditor;

  function addMultiRequest(address requester, uint256 firstRequestId, uint256 lastRequestId, address registrar) external onlyWhitelisted returns(uint256) {
    multiRequests[++multiRequestIdCounter] = MultiRequest(requester, firstRequestId, lastRequestId, registrar);
    return multiRequestIdCounter;
  }

  function setMultiRequestRequester(uint256 multiRequestId, address requester) external onlyWhitelisted {
    multiRequests[multiRequestId].requester = requester;
  }

  function setMultiRequestFirstRequestId(uint256 multiRequestId, uint256 firstRequestId) external onlyWhitelisted {
    multiRequests[multiRequestId].firstRequestId = firstRequestId;
  }

  function setMultiRequestLastRequestId(uint256 multiRequestId, uint256 lastRequestId) external onlyWhitelisted {
    multiRequests[multiRequestId].lastRequestId = lastRequestId;
  }

  function setMultiRequestRegistrar(uint256 multiRequestId, address registrar) external onlyWhitelisted {
    multiRequests[multiRequestId].registrar = registrar;
  }

  function setRequestIdToMultiRequestId(uint256 requestId, uint256 multiRequestId) external onlyWhitelisted {
    requestIdToMultiRequestId[requestId] = multiRequestId;
  }

  function addAuditorToMultiRequestAssignment(uint256 multiRequestId, address auditor) external onlyWhitelisted {
    multiRequestsAssignedToAuditor[multiRequestId][auditor] = true;
  }

  function removeAuditorFromMultiRequestAssignment(uint256 multiRequestId, address auditor) external onlyWhitelisted {
    delete multiRequestsAssignedToAuditor[multiRequestId][auditor];
  }
  
  function getMultiRequestRequester(uint256 multiRequestId) external view returns(address) {
    return multiRequests[multiRequestId].requester;
  }

  function getMultiRequestFirstRequestId(uint256 multiRequestId) external view returns(uint256) {
    return multiRequests[multiRequestId].firstRequestId;
  }

  function getMultiRequestLastRequestId(uint256 multiRequestId) external view returns(uint256) {
    return multiRequests[multiRequestId].lastRequestId;
  }

  function getMultiRequestRegistrar(uint256 multiRequestId) external view returns(address) {
    return multiRequests[multiRequestId].registrar;
  }

  function getMultiRequestIdGivenRequestId(uint256 requestId) external view returns(uint256) {
    return requestIdToMultiRequestId[requestId];
  }

  function existsAuditorFromMultiRequestAssignment(uint256 multiRequestId, address auditor) external view returns(bool) {
    return multiRequestsAssignedToAuditor[multiRequestId][auditor];
  }

}
