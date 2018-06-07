pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./QuantstampAudit.sol";
import "./QuantstampAuditData.sol";

contract QuantstampAuditView is Ownable {

  using SafeMath for uint256;

  QuantstampAudit public audit;
  QuantstampAuditData public auditData;

  struct AuditPriceStat {
    uint256 sum;
    uint256 max;
    uint256 min;
    uint256 n;
  }

  /**
   * @dev The constructor creates an audit contract.
   * @param auditAddress The address of a QuantstampAudit that will be queried.
   * @param auditDataAddress The address of a QuantstampAuditData that will be queried
   */
  constructor (address auditAddress, address auditDataAddress) public {
    require(auditAddress != address(0));
    require(auditDataAddress != address(0));
    audit = QuantstampAudit(auditAddress);
    auditData = QuantstampAuditData(auditDataAddress);
  }

  /**
   * @dev The setter for changing the reference to QuantstampAudit
   * @param auditAddress address of a QuantstampAudit instance
   */
  function setQuantstampAudit(address auditAddress) public onlyOwner {
    require(auditAddress != address(0));
    audit = QuantstampAudit(auditAddress);
  }

  /**
   * @dev The setter for changing the reference to QuantstampAuditData
   * @param auditDataAddress address of a QuantstampAuditData
   */
  function setQuantstampAuditData(address auditDataAddress) public onlyOwner {
    require(auditDataAddress != address(0));
    auditData = QuantstampAuditData(auditDataAddress);
  }

  /**
   * @dev Returns stats of min audit prices
   */
  function findMinAuditPricesStats() internal view returns (AuditPriceStat) {
    uint256 sum;
    uint256 n;
    uint256 min = 2**256 - 1;
    uint256 max;

    address currentWhitelistedAddress = audit.getNextWhitelistedAddress(address(HEAD));
    while (currentWhitelistedAddress != address(HEAD)) {
      n++;
      uint256 minPrice = auditData.minAuditPrice(currentWhitelistedAddress);
      sum += minPrice;
      if (minPrice < min) {
        min = minPrice;
      }
      if (minPrice > max) {
        max = minPrice;
      }
      currentWhitelistedAddress = audit.getNextWhitelistedAddress(currentWhitelistedAddress);
    }

    if (n == 0) {
      min = 0;
    }
    return AuditPriceStat(sum, max, min, n);
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
  function getQueueLength() public view returns(uint256 numElements) {
    uint256 price;
    uint256 requestId;
    // iterate over the price list. Consider the zero prices as well.
    price = audit.getNextPrices(HEAD);
    do {
      requestId = audit.getNextAuditsByPrice(price, HEAD);
      // The first requestId is one.
      while (requestId != HEAD) {
        numElements++;
        requestId = audit.getNextAuditsByPrice(price, requestId);
      }
      price = audit.getNextPrices(price);
    } while (price != HEAD);
    return numElements;
  }
}
