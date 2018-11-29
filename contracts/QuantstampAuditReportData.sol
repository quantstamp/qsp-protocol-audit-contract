pragma solidity 0.4.25;

import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";


contract QuantstampAuditReportData is Whitelist {

  // mapping from requestId to a report
  mapping(uint256 => bytes) public reports;

  function setReport(uint256 requestId, bytes report) external onlyWhitelisted {
    reports[requestId] = report;
  }

  function getReport(uint256 requestId) external view returns(bytes) {
    return reports[requestId];
  }

}
