pragma solidity 0.4.25;

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
  QuantstampAuditTokenEscrow public tokenEscrow;

  struct AuditPriceStat {
    uint256 sum;
    uint256 max;
    uint256 min;
    uint256 median;
    uint256 n;
  }

  /**
   * @dev The setter for changing the reference to QuantstampAudit.
   * @param auditAddress Address of a QuantstampAudit instance.
   */
  function setQuantstampAudit(address auditAddress) public onlyOwner {
    require(auditAddress != address(0));
    audit = QuantstampAudit(auditAddress);
    auditData = audit.auditData();
    reportData = audit.reportData();
    tokenEscrow = audit.tokenEscrow();
  }

  /**
   * @dev Computes the hash of the report stored on-chain.
   * @param requestId The corresponding requestId.
   */
  function getReportHash(uint256 requestId) public view returns (bytes32) {
    return keccak256(reportData.getReport(requestId));
  }

  /**
   * @dev Returns the lower cap of the audit prices.
   */
  function getMinAuditPriceLowerCap() public view returns (uint256) {
    return audit.getMinAuditPriceLowerCap();
  }
  
  /**
   * @dev Returns the sum of min audit prices.
   */
  function getMinAuditPriceSum() public view returns (uint256) {
    return findMinAuditPricesStats().sum;
  }

  /**
   * @dev Returns the number of min audit prices.
   */
  function getMinAuditPriceCount() public view returns (uint256) {
    return findMinAuditPricesStats().n;
  }

  /**
   * @dev Returns max of min audit prices.
   */
  function getMinAuditPriceMax() public view returns (uint256) {
    return findMinAuditPricesStats().max;
  }

  /**
   * @dev Returns min of min audit prices.
   */
  function getMinAuditPriceMin() public view returns (uint256) {
    return findMinAuditPricesStats().min;
  }

  /**
   * @dev Returns min of min audit prices.
   */
  function getMinAuditPriceMedian() public view returns (uint256) {
    return findMinAuditPricesStats().median;
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
   * @dev Returns stats of min audit prices.
   */
  function findMinAuditPricesStats() internal view returns (AuditPriceStat) {
    uint256 sum;
    uint256 n;
    uint256 min = MAX_INT;
    uint256 max;
    uint256 median;
    uint256 numNodesWithEnoughStake;

    // arrays in memory must have a fixed length, so first pre-compute how many staked nodes exist
    address currentStakedAddress = tokenEscrow.getNextStakedNode(address(HEAD));
    while (currentStakedAddress != address(HEAD)) {
      numNodesWithEnoughStake++;
      currentStakedAddress = tokenEscrow.getNextStakedNode(currentStakedAddress);
    }

    uint256[] memory minPriceArray = new uint256[](numNodesWithEnoughStake);
    currentStakedAddress = tokenEscrow.getNextStakedNode(address(HEAD));
    while (currentStakedAddress != address(HEAD)) {
      uint256 minPrice = auditData.minAuditPrice(currentStakedAddress);
      minPriceArray[n] = minPrice;
      n++;
      sum = sum.add(minPrice);
      if (minPrice < min) {
        min = minPrice;
      }
      if (minPrice > max) {
        max = minPrice;
      }
      currentStakedAddress = tokenEscrow.getNextStakedNode(currentStakedAddress);
    }

    if (n == 0) {
      min = 0;
      median = 0;
    } else {
      minPriceArray = sortArray(minPriceArray);
      if (n % 2 == 1) {
        median = minPriceArray[n / 2];
      } else {
        median = (minPriceArray[n / 2] + minPriceArray[(n / 2) - 1]) / 2;
      }
    }

    return AuditPriceStat(sum, max, min, median, n);
  }

  /**
   * @dev Very simple approach for sorting small arrays.
   */
  function sortArray(uint256[] memory arr) internal pure returns (uint256[]) {
    uint256 temp;
    for (uint256 i = 0; i < arr.length; i++) {
      for (uint256 j = i+1; j < arr.length; j++) {
        if (arr[i] > arr[j]) {
          temp = arr[i];
          arr[i] = arr[j];
          arr[j] = temp;
        }
      }
    }
    return arr;
  }
}
