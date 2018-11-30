pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./QuantstampAudit.sol";
import "./QuantstampAuditData.sol";
import "./QuantstampAuditReportData.sol";


contract QuantstampAuditView is Ownable {
  using SafeMath for uint256;

  uint256 constant internal HEAD = 0;
  uint256 constant internal MAX_INT = 2**256 - 1;

  QuantstampAudit public audit;
  QuantstampAuditData public auditData;
  QuantstampAuditReportData public reportData;
  QuantstampAuditMultiRequestData public multiRequestData;
  QuantstampAuditTokenEscrow public tokenEscrow;

  struct AuditPriceStat {
    uint256 sum;
    uint256 max;
    uint256 min;
    uint256 n;
  }

  /**
   * @dev The constructor creates an audit contract.
   * @param auditAddress The address of a QuantstampAudit that will be queried.
   */
  constructor (address auditAddress) public {
    require(auditAddress != address(0));
    audit = QuantstampAudit(auditAddress);
    auditData = audit.auditData();
    reportData = audit.reportData();
    multiRequestData = audit.multiRequestData();
    tokenEscrow = audit.tokenEscrow();
  }

  /**
   * @dev The setter for changing the reference to QuantstampAudit
   * @param auditAddress address of a QuantstampAudit instance
   */
  function setQuantstampAudit(address auditAddress) public onlyOwner {
    require(auditAddress != address(0));
    audit = QuantstampAudit(auditAddress);
    auditData = audit.auditData();
  }

  /**
   * @dev computing hash of the report stored on-chain
   * @param requestId corresponding requestId
   */
  function getReportHash(uint256 requestId) public view returns (bytes32) {
    return keccak256(reportData.getReport(requestId));
  }
  
  /**
   * @dev Returns sum of min audit prices
   */
  function getMinAuditPriceSum() public view returns (uint256) {
    return findMinAuditPricesStats().sum;
  }

  /**
   * @dev Returns the number of min audit prices
   */
  function getMinAuditPriceCount() public view returns (uint256) {
    return findMinAuditPricesStats().n;
  }

  /**
   * @dev Returns max of min audit prices
   */
  function getMinAuditPriceMax() public view returns (uint256) {
    return findMinAuditPricesStats().max;
  }

  /**
   * @dev Returns min of min audit prices
   */
  function getMinAuditPriceMin() public view returns (uint256) {
    return findMinAuditPricesStats().min;
  }

  /**
   * @dev Returns the number of unassigned audit requests in the queue.
   */
  function getQueueLength() public view returns(uint256) {
    uint256 price;
    uint256 requestId;
    // iterate over the price list. Consider the zero prices as well.
    price = audit.getNextPrice(HEAD);
    uint256 numElements = 0;
    do {
      requestId = audit.getNextAuditByPrice(price, HEAD);
      // The first requestId is one.
      while (requestId != HEAD) {
        numElements++;
        requestId = audit.getNextAuditByPrice(price, requestId);
      }
      price = audit.getNextPrice(price);
    } while (price != HEAD);
    return numElements;
  }

  /**
   * @dev Retrieves requestIds given a multiRequestId
   * @param multiRequestId multiRequestId that will be mapped to associated requestIds
   */
  function multiRequestIdToRequestIds(uint256 multiRequestId) public view returns(uint256[]) {
    uint256 firstRequestId = multiRequestData.getMultiRequestFirstRequestId(multiRequestId);
    uint256 lastRequestId = multiRequestData.getMultiRequestLastRequestId(multiRequestId);
    uint256 resultLength = 0;
    if (lastRequestId > 0) {
      resultLength = lastRequestId - firstRequestId + 1;
    }
    uint256[] memory result = new uint256[](resultLength);
    for (uint256 i = 0; i < resultLength; ++i) {
      result[i] = firstRequestId + i;
    }
    return result;
  }

  /**
   * @dev Returns stats of min audit prices
   */
  function findMinAuditPricesStats() internal view returns (AuditPriceStat) {
    uint256 sum;
    uint256 n;
    uint256 min = MAX_INT;
    uint256 max;

    address currentStakedAddress = tokenEscrow.getNextStakedNode(address(HEAD));
    while (currentStakedAddress != address(HEAD)) {
      uint256 minPrice = auditData.minAuditPrice(currentStakedAddress);
      if (minPrice != MAX_INT) {
        n++;
        sum += minPrice;
        if (minPrice < min) {
          min = minPrice;
        }
        if (minPrice > max) {
          max = minPrice;
        }
      }
      currentStakedAddress = tokenEscrow.getNextStakedNode(currentStakedAddress);
    }

    if (n == 0) {
      min = 0;
    }
    return AuditPriceStat(sum, max, min, n);
  }
}
