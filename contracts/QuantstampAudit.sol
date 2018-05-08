pragma solidity 0.4.23;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";

import "./Queue.sol";

contract QuantstampAudit is Ownable, Whitelist, Pausable {
  using SafeMath for uint256;

  // state of audit requests submitted to the contract
  enum AuditState {
    None,
    Queued,
    Assigned,
    Completed,  // automated audit finished successfully and the report is available
    Error,      // automated audit failed to finish; the report contains detailed information about the error
    Timeout     // automated audit timed out, as no auditor node returned the report
  }

  // structure representing an audit
  struct Audit {
    address requestor;
    string contractUri;
    uint256 price;
    uint256 transactionFee;
    uint requestTimestamp; // approximate time of when audit was requested
    AuditState state;
    address auditor;       // the address of the node assigned to the audit
    uint assignTimestamp;  // approximate time of when audit was assigned
    string reportUri;      // stores the audit report URI
    string reportHash;     // stores the hash of audit report
    uint reportTimestamp;  // approximate time of when the payment and the audit report were submitted
  }

  // map audits (requestId, Audit)
  mapping(uint256 => Audit) public audits;

  // TODO: figure out what a reasonable value for timeout is. For now 10 blocks.
  uint256 public auditTimeoutInBlocks = 10;

  Uint256Queue requestQueue;
  Uint256Queue assignedQueue;
  uint256 constant REQUEST_QUEUE_CAPACITY = 30000;

  // token used to pay for audits. This contract assumes that the owner of the contract trusts token's code and
  // that transfer function (such as transferFrom, transfer) do the right thing
  StandardToken public token;

  // transaction fee is required to pay auditors their reward or refund the tokens to the requestor
  // the fee is used to offset the gas cost needed to invoke submitReport()
  uint256 public transactionFee;

  // map audit nodes to their minimum prices. Defaults to zero: the node accepts all requests.
  mapping(address => uint256) minAuditPrice; 

  event LogAuditFinished(
    uint256 requestId,
    address auditor,
    AuditState auditResult,
    string reportUri,
    string reportHash,
    uint256 reportTimestamp
  );

  event LogAuditRequested(uint256 requestId, 
    address requestor, 
    string uri, 
    uint256 price, 
    uint256 transactionFee, 
    uint256 requestTimestamp
  );

  event LogAuditAssigned(uint256 requestId, address auditor);
  event LogReportSubmissionError_InvalidAuditor(uint256 requestId, address auditor);
  event LogReportSubmissionError_InvalidState(uint256 requestId, address auditor, AuditState state);
  event LogErrorAlreadyAudited(uint256 requestId, address requestor, string uri);
  event LogUnableToRequestAudit(uint256 requestId, address requestor, string uri);
  event LogUnableToAssignAudit(uint256 requestId);
  event LogAuditQueueIsEmpty();

  event LogPayAuditor(uint256 requestId, address auditor, uint256 amount);
  event LogRefund(uint256 requestId, address requestor, uint256 amount);
  event LogTransactionFeeChanged(uint256 oldFee, uint256 newFee);
  event LogAuditNodePriceChanged(address auditor, uint256 price);

  // error handling events
  // payment is requested for an audit that is already already paid or does not exist
  event LogErrorAuditNotPending(uint256 requestId, address auditor);

  uint256 private requestCounter;

  /**
   * @dev The constructor creates an audit contract.
   * @param tokenAddress The address of a StandardToken that will be used to pay auditor nodes.
   */
  constructor (address tokenAddress) public {
    require(tokenAddress != address(0));
    token = StandardToken(tokenAddress);
    requestQueue = new Uint256Queue(REQUEST_QUEUE_CAPACITY);
    assignedQueue = new Uint256Queue(REQUEST_QUEUE_CAPACITY);
  }

  /**
   * @dev Submits audit request.
   * @param contractUri Identifier of the resource to audit.
   * @param price The total amount of tokens that will be paid for the audit.
   */
  function requestAudit(string contractUri, uint256 price) external payable whenNotPaused returns(uint256) {
    // check if user sends enough pre-paid gas
    require(msg.value >= transactionFee); // TODO: there should be an event if this fails
    // the sender is the requestor
    address requestor = msg.sender;
    // transfer transaction fee (in Wei) to the contract owner to offset gas cost
    owner.transfer(msg.value);
    // transfer tokens to this contract
    token.transferFrom(msg.sender, this, price);
    // assign the next request ID
    uint256 requestId = ++requestCounter;
    // store the audit
    audits[requestId] = Audit(msg.sender, contractUri, price, transactionFee, block.timestamp, AuditState.Queued, address(0), 0, "", "", 0);

    // TODO: we are still adding to audits and incrementing requestId if we fail here
    if (requestQueue.push(requestId) != Uint256Queue.PushResult.Success) {
      emit LogUnableToRequestAudit(requestId, requestor, contractUri);
      return;
    }
    emit LogAuditRequested(requestId, requestor, contractUri, price, transactionFee, block.timestamp);

    return requestId;
  }

  /**
   * @dev Submits the report and pays the auditor node for their work or refunds tokens to the requestor in case of an error.
   * @param requestId Unique identifier of the audit request.
   * @param auditResult Result of an audit.
   * @param reportUri URI to the generated report.
   * @param reportHash Hash of the generated report.
   */
  function submitReport(uint256 requestId, AuditState auditResult, string reportUri, string reportHash) public onlyWhitelisted {
    Audit storage audit = audits[requestId];
    if (audit.state != AuditState.Assigned && audit.state != AuditState.Timeout) {
      emit LogReportSubmissionError_InvalidState(requestId, msg.sender, audit.state);
      return;
    }

    // the sender must be the auditor
    if (msg.sender != audit.auditor)  {
      emit LogReportSubmissionError_InvalidAuditor(requestId, msg.sender);
      return;
    }

    // update the audit information held in this contract
    audit.state = auditResult;
    audit.reportUri = reportUri;
    audit.reportHash = reportHash;
    audit.reportTimestamp = block.timestamp;

    // validate the audit state
    require(isAuditFinished(requestId));

    // if the analysis timeouts, the auditor address is set to 0
    address auditor = auditResult == AuditState.Timeout ? address(0) : msg.sender;

    emit LogAuditFinished(requestId,  auditor, auditResult, reportUri, reportHash, block.timestamp);

    bool isRefund = AuditState.Completed != auditResult;
    // pay the requestor in case of a refund; pay the auditor node otherwise
    token.transfer(isRefund ? audit.requestor : auditor, audit.price);
    if (isRefund) {
      emit LogRefund(requestId, audit.requestor, audit.price);
    } else {
      emit LogPayAuditor(requestId, auditor, audit.price);
    }
  }

  // TODO: should this return the requestId, in addition to emitting a log?
  function getNextAuditRequest() public onlyWhitelisted {
    Uint256Queue.PopResult popResult;
    uint256 requestId;

    (popResult, requestId) = requestQueue.pop();
    if (popResult == Uint256Queue.PopResult.QueueIsEmpty) {
      emit LogAuditQueueIsEmpty(); // TODO should this contain msg.sender as an argument?
      return;
    }
    if (assignedQueue.push(requestId) != Uint256Queue.PushResult.Success) {
      emit LogUnableToAssignAudit(requestId);
      return;
    }
    audits[requestId].state = AuditState.Assigned;
    audits[requestId].auditor = msg.sender;
    audits[requestId].assignTimestamp = block.number;

    emit LogAuditAssigned(
      requestId,
      audits[requestId].auditor
    );
  }

  /**
   * @dev Allows the audit node to set its minimum price per audit
   * @param price The minimum price.  
   */
  function setAuditNodePrice(uint256 price) public onlyWhitelisted {
    minAuditPrice[msg.sender] = price;
    emit LogAuditNodePriceChanged(msg.sender, price);
  }

  /**
   * @dev Sets transaction fee in Wei
   * @param fee Transaction fee in Wei.
   */
  function setTransactionFee(uint256 fee) external onlyOwner {
    emit LogTransactionFeeChanged(transactionFee, fee);
    transactionFee = fee;
  }

  // Loops over front audits in the assigned queue to detect timeouts. If an audit is finished, removes it from the queue.
  function detectAuditTimeouts() public {
    Uint256Queue.PopResult popResult;
    uint256 requestId;

    // loops over the queue while not empty
    while(!assignedQueue.isEmpty()) {
      // looks at the front of the queue
      (popResult, requestId) = assignedQueue.peek();
      detectTimeout(requestId);
      // if the audit at the front is still pending, return
      if (!isAuditFinished(requestId)) {
        return;
      }
      // otherwise, remove the element and keep looping
      assignedQueue.pop();
    }
  }

  /**
   * @dev Detects if a given audit request timed out. If so, it sets requests' status to timeout and submits the report.
   * @param requestId Unique ID of the audit request.
   */
  function detectTimeout(uint256 requestId) public {
    Audit storage audit = audits[requestId];

    // conditions for detecting a timeout
    if (!isAuditFinished(requestId) &&
      ((audit.assignTimestamp + auditTimeoutInBlocks) < block.number)) {
      // updates the status
      audit.state = AuditState.Timeout;
      audit.auditor = msg.sender;
      // submits a report for timeout
      submitReport(requestId, AuditState.Timeout, "", "");
    }
  }


  /**
   * @dev Checks if an audit is finished. It is considered finished when the audit is either completed or failed.
   * @param requestId Unique ID of the audit request.
   */
  function isAuditFinished(uint256 requestId) view public returns(bool) {
    return audits[requestId].state == AuditState.Completed 
    || audits[requestId].state == AuditState.Error 
    || audits[requestId].state == AuditState.Timeout;
  }

  /**
   * @dev Returns funds to the requestor.
   * @param requestId Unique ID of the audit request.
   */
  function refund(uint256 requestId) external onlyOwner returns(bool) {
    require(audits[requestId].requestor != address(0));
    return token.transfer(audits[requestId].requestor, audits[requestId].price);
  }

  function getAuditState(uint256 requestId) public constant returns(AuditState) {
    return audits[requestId].state;
  }

  function getQueueLength() public constant returns(uint) {
    return requestQueue.length();
  }

  function getQueueCapacity() public constant returns(uint) {
    return requestQueue.capacity();
  }

  function setAuditTimeout(uint256 timeoutInBlocks) public {
    auditTimeoutInBlocks = timeoutInBlocks;
  }
}
