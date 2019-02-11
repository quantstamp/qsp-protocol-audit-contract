pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";


contract QuantstampAuditData is Whitelist {
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
    uint256 requestBlockNumber; // block number that audit was requested
    QuantstampAuditData.AuditState state;
    address auditor;       // the address of the node assigned to the audit
    uint256 assignBlockNumber;  // block number that audit was assigned
    string reportHash;     // stores the hash of audit report
    uint256 reportBlockNumber;  // block number that the payment and the audit report were submitted
    address registrar;  // address of the contract which registers this request
  }

  // map audits (requestId, Audit)
  mapping(uint256 => Audit) public audits;

  // token used to pay for audits. This contract assumes that the owner of the contract trusts token's code and
  // that transfer function (such as transferFrom, transfer) do the right thing
  StandardToken public token;

  // Once an audit node gets an audit request, they must submit a report within this many blocks.
  // After that, the report is verified by the police.
  uint256 public auditTimeoutInBlocks = 50;

  // maximum number of assigned audits per each audit node
  uint256 public maxAssignedRequests = 10;

  // map audit nodes to their minimum prices. Defaults to zero: the node accepts all requests.
  mapping(address => uint256) public minAuditPrice;

  // For generating requestIds starting from 1
  uint256 private requestCounter;

  /**
   * @dev The constructor creates an audit contract.
   * @param tokenAddress The address of a StandardToken that will be used to pay audit nodes.
   */
  constructor (address tokenAddress) public {
    require(tokenAddress != address(0));
    token = StandardToken(tokenAddress);
  }

  function addAuditRequest (address requestor, string contractUri, uint256 price) public onlyWhitelisted returns(uint256) {
    // assign the next request ID
    uint256 requestId = ++requestCounter;
    // store the audit
    audits[requestId] = Audit(requestor, contractUri, price, block.number, AuditState.Queued, address(0), 0, "", 0, msg.sender);  // solhint-disable-line not-rely-on-time
    return requestId;
  }

  /**
   * @dev Allows a whitelisted logic contract (QuantstampAudit) to spend stored tokens.
   * @param amount The number of wei-QSP that will be approved.
   */
  function approveWhitelisted(uint256 amount) public onlyWhitelisted {
    token.approve(msg.sender, amount);
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

  function getAuditRequestBlockNumber (uint256 requestId) public view returns(uint) {
    return audits[requestId].requestBlockNumber;
  }

  function setAuditState (uint256 requestId, AuditState state) public onlyWhitelisted {
    audits[requestId].state = state;
  }

  function getAuditAuditor (uint256 requestId) public view returns(address) {
    return audits[requestId].auditor;
  }

  function getAuditRegistrar (uint256 requestId) public view returns(address) {
    return audits[requestId].registrar;
  }

  function setAuditAuditor (uint256 requestId, address auditor) public onlyWhitelisted {
    audits[requestId].auditor = auditor;
  }

  function getAuditAssignBlockNumber (uint256 requestId) public view returns(uint256) {
    return audits[requestId].assignBlockNumber;
  }

  function getAuditReportBlockNumber (uint256 requestId) public view returns (uint256) {
    return audits[requestId].reportBlockNumber;
  }

  function setAuditAssignBlockNumber (uint256 requestId, uint256 assignBlockNumber) public onlyWhitelisted {
    audits[requestId].assignBlockNumber = assignBlockNumber;
  }

  function setAuditReportHash (uint256 requestId, string reportHash) public onlyWhitelisted {
    audits[requestId].reportHash = reportHash;
  }

  function setAuditReportBlockNumber (uint256 requestId, uint256 reportBlockNumber) public onlyWhitelisted {
    audits[requestId].reportBlockNumber = reportBlockNumber;
  }

  function setAuditRegistrar (uint256 requestId, address registrar) public onlyWhitelisted {
    audits[requestId].registrar = registrar;
  }

  function setAuditTimeout (uint256 timeoutInBlocks) public onlyOwner {
    auditTimeoutInBlocks = timeoutInBlocks;
  }

  /**
   * @dev Set the maximum number of audits any audit node can handle at any time.
   * @param maxAssignments Maximum number of audit requests for each audit node.
   */
  function setMaxAssignedRequests (uint256 maxAssignments) public onlyOwner {
    maxAssignedRequests = maxAssignments;
  }

  function getMinAuditPrice (address auditor) public view returns(uint256) {
    return minAuditPrice[auditor];
  }

  /**
   * @dev Allows the audit node to set its minimum price per audit in wei-QSP.
   * @param price The minimum price.
   */
  function setMinAuditPrice(address auditor, uint256 price) public onlyWhitelisted {
    minAuditPrice[auditor] = price;
  }
}
