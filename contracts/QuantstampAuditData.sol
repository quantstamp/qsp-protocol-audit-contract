pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";

import "./LinkedListLib.sol";


contract QuantstampAuditData is Whitelist {
  // the audit data has a whitelist of addresses of audit contracts that may interact with this contract
  using LinkedListLib for LinkedListLib.LinkedList;

  // constants used by LinkedListLib
  uint256 constant internal NULL = 0;
  uint256 constant internal HEAD = 0;
  bool constant internal PREV = false;
  bool constant internal NEXT = true;

  // state of audit requests submitted to the contract
  enum AuditState {
    None,
    Queued,
    Assigned,
    Refunded,
    Completed,  // automated audit finished successfully and the report is available
    Error,      // automated audit failed to finish; the report contains detailed information about the error
    Expired,
    Resolved
  }

  // structure representing an audit
  struct Audit {
    address requestor;
    string contractUri;
    uint256 price;
    uint requestTimestamp; // approximate time of when audit was requested
    QuantstampAuditData.AuditState state;
    address auditor;       // the address of the node assigned to the audit
    uint assignTimestamp;  // approximate time of when audit was assigned
    string reportHash;     // stores the hash of audit report
    uint reportTimestamp;  // approximate time of when the payment and the audit report were submitted
  }

  // map audits (requestId, Audit)
  mapping(uint256 => Audit) public audits;

  // token used to pay for audits. This contract assumes that the owner of the contract trusts token's code and
  // that transfer function (such as transferFrom, transfer) do the right thing
  StandardToken public token;

  // 10 blocks seems like a reasonable default timeout
  // Once an audit node gets an audit request, the audit price is locked for this many blocks.
  // After that, the requestor can asks for a refund.
  uint256 public auditTimeoutInBlocks = 25;

  // maximum number of assigned audits per each auditor
  uint256 public maxAssignedRequests = 10;

  // map audit nodes to their minimum prices. Defaults to zero: the node accepts all requests.
  mapping(address => uint256) public minAuditPrice;

  // whitelist audit nodes
  LinkedListLib.LinkedList internal whitelistedNodesList;

  uint256 private requestCounter;

  event WhitelistedNodeAdded(address addr);
  event WhitelistedNodeRemoved(address addr);

  /**
   * @dev The constructor creates an audit contract.
   * @param tokenAddress The address of a StandardToken that will be used to pay auditor nodes.
   */
  constructor (address tokenAddress) public {
    require(tokenAddress != address(0));
    token = StandardToken(tokenAddress);
  }

  function addAuditRequest (address requestor, string contractUri, uint256 price) public onlyWhitelisted returns(uint256) {
    // assign the next request ID
    uint256 requestId = ++requestCounter;
    // store the audit
    audits[requestId] = Audit(requestor, contractUri, price, block.timestamp, AuditState.Queued, address(0), 0, "", 0);  // solhint-disable-line not-rely-on-time
    return requestId;
  }

  function getAuditContractUri(uint256 requestId) public view returns(string) {
    return audits[requestId].contractUri;
  }

  function getAuditRequestor(uint256 requestId) public view returns(address) {
    return audits[requestId].requestor;
  }

  function getAuditPrice (uint256 requestId) public view returns(uint256) {
    return audits[requestId].price;
  }

  function getAuditState (uint256 requestId) public view returns(AuditState) {
    return audits[requestId].state;
  }

  function getAuditRequestTimestamp (uint256 requestId) public view returns(uint) {
    return audits[requestId].requestTimestamp;
  }

  function setAuditState (uint256 requestId, AuditState state) public onlyWhitelisted {
    audits[requestId].state = state;
  }

  function getAuditAuditor (uint256 requestId) public view returns(address) {
    return audits[requestId].auditor;
  }

  function setAuditAuditor (uint256 requestId, address auditor) public onlyWhitelisted {
    audits[requestId].auditor = auditor;
  }

  function getAuditAssignTimestamp (uint256 requestId) public view returns(uint) {
    return audits[requestId].assignTimestamp;
  }

  function setAuditAssignTimestamp (uint256 requestId, uint assignTimestamp) public onlyWhitelisted {
    audits[requestId].assignTimestamp = assignTimestamp;
  }

  function setAuditReportHash (uint256 requestId, string reportHash) public onlyWhitelisted {
    audits[requestId].reportHash = reportHash;
  }

  function setAuditReportTimestamp (uint256 requestId, uint reportTimestamp) public onlyWhitelisted {
    audits[requestId].reportTimestamp = reportTimestamp;
  }

  function setAuditTimeout (uint256 timeoutInBlocks) public onlyOwner {
    auditTimeoutInBlocks = timeoutInBlocks;
  }

  /**
   * @dev set the maximum number of audits any audit node can handle at any time.
   * @param maxAssignments maximum number of audit requests for each auditor
   */
  function setMaxAssignedRequests (uint256 maxAssignments) public onlyOwner {
    maxAssignedRequests = maxAssignments;
  }

  function getMinAuditPrice (address auditor) public view returns(uint256) {
    return minAuditPrice[auditor];
  }

  /**
   * @dev Allows the audit node to set its minimum price per audit
   * @param price The minimum price.
   */
  function setMinAuditPrice(address auditor, uint256 price) public onlyWhitelisted {
    minAuditPrice[auditor] = price;
  }

  /**
   * @dev Returns true if a node is whitelisted
   * param node Node to check.
   */
  function isWhitelisted(address node) public view returns(bool) {
    return whitelistedNodesList.nodeExists(uint256(node));
  }

  /**
   * @dev Adds an address to the whitelist
   * @param addr address
   * @return true if the address was added to the whitelist
   */
  function addNodeToWhitelist(address addr) public onlyOwner returns(bool success) {
    if (whitelistedNodesList.insert(HEAD, uint256(addr), PREV)) {
      emit WhitelistedNodeAdded(addr);
      success = true;
    }
  }

  /**
   * @dev Removes an address from the whitelist linked-list
   * @param addr address
   * @return true if the address was removed from the whitelist,
   */
  function removeNodeFromWhitelist(address addr) public onlyOwner returns(bool success) {
    if (whitelistedNodesList.remove(uint256(addr)) != 0) {
      emit WhitelistedNodeRemoved(addr);
      success = true;
    }
  }

  /**
   * @dev Given a whitelisted address, returns the next address from the whitelist
   * @param addr address
   * @return next address of the given param
   */
  function getNextWhitelistedNode(address addr) public view returns(address) {
    bool direction;
    uint256 next;
    (direction, next) = whitelistedNodesList.getAdjacent(uint256(addr), NEXT);
    return address(next);
  }
}
