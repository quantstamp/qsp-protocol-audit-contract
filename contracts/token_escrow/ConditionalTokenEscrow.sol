/**
 * NOTE: All contracts in this directory were taken from a non-master branch of openzeppelin-solidity.
 * Commit: ed451a8688d1fa7c927b27cec299a9726667d9b1
 */

pragma solidity ^0.4.24;

import "./TokenEscrow.sol";


/**
 * @title ConditionalTokenEscrow
 * @dev Base abstract escrow to only allow withdrawal of tokens
 * if a condition is met.
 */
contract ConditionalTokenEscrow is TokenEscrow {
  /**
  * @dev Returns whether an address is allowed to withdraw their tokens.
  * To be implemented by derived contracts.
  * @param _payee The destination address of the tokens.
  */
  function withdrawalAllowed(address _payee) public view returns (bool);

  function withdraw(address _payee) public {
    require(withdrawalAllowed(_payee));
    super.withdraw(_payee);
  }
}
