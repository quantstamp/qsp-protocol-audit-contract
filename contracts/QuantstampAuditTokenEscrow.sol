pragma solidity 0.4.24;

import "./token_escrow/ConditionalTokenEscrow.sol";

contract QuantstampAuditTokenEscrow is ConditionalTokenEscrow {

  // The minimum amount of weiQSP that must be staked in order to be a node
  uint256 public minAuditStake = 10000 * (10 ** 18);

  // if true, the payee cannot currently withdraw their funds
  mapping(address => bool) public lockedFunds;

  // if funds are locked, they may be retrieved after this block
  // if funds are unlocked, the number should be ignored
  mapping(address => uint256) public unlockBlockNumber;

  // the constructor of TokenEscrow requires an ERC20, not an address
  constructor(address tokenAddress) TokenEscrow(ERC20(tokenAddress)) public { }

  /**
   * @dev Sets the minimum stake to a new value.
   * @param _value The new value.
   */
  function setMinAuditStake(uint256 _value) public onlyOwner {
    minAuditStake = _value;
  }

  /**
   * @dev Overrides ConditionalTokenEscrow function. If true, funds may be withdrawn.
   * @param _payee The address that wants to withdraw funds.
   */
  function withdrawalAllowed(address _payee) public view returns (bool) {
    return !lockedFunds[_payee] || unlockBlockNumber[_payee] <= block.number;
  }

  /**
   * @dev Prevents the payee from withdrawing funds.
   * @param _payee The address that will be locked.
   */
  function lockFunds(address _payee, uint256 _unlockBlockNumber) public onlyWhitelisted returns (bool) {
    require(_unlockBlockNumber > block.number);
    lockedFunds[_payee] = true;
    unlockBlockNumber[_payee] = _unlockBlockNumber;
    return true;
  }

  /**
   * @dev Allows the payee to withdraw funds.
   * @param _payee The address that will be unlocked.
   */
  function unlockFunds(address _payee) public onlyWhitelisted returns (bool) {
    lockedFunds[_payee] = false;
    return true;
  }
}
