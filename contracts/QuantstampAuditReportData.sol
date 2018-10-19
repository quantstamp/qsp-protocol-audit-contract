pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/ownership/Whitelist.sol";


contract QuantstampAuditReportData is Whitelist {

  // mapping from requestId to a report
  mapping(uint256 => bytes1[]) public reports;


  function setReport(uint256 requestId, bytes1[] report) external onlyWhitelisted {
    reports[requestId] = report;
  }

  function getReport(uint256 requestId) external view returns(bytes1[]) {
    return reports[requestId];
  }

}
