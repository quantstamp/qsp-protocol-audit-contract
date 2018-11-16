pragma solidity 0.4.24;

import "./token_escrow/ConditionalTokenEscrow.sol";


contract QuantstampAuditTokenEscrow is ConditionalTokenEscrow {

  // the minimum amount of wei-QSP that must be staked in order to be a node
  uint256 public minAuditStake = 10000 * (10 ** 18);

  // if true, the payee cannot currently withdraw their funds
  mapping(address => bool) public lockedFunds;

  // if funds are locked, they may be retrieved after this block
  // if funds are unlocked, the number should be ignored
  mapping(address => uint256) public unlockBlockNumber;

  // the constructor of TokenEscrow requires an ERC20, not an address
  constructor(address tokenAddress) public TokenEscrow(ERC20(tokenAddress)) {} // solhint-disable no-empty-blocks

  /**
   * @dev Sets the minimum stake to a new value.
   * @param _value The new value.
   */
  function setMinAuditStake(uint256 _value) public onlyOwner {
    minAuditStake = _value;
  }

  /**
   * @dev Returns true if the sender staked enough.
   * @param addr The address to check.
   */
  function hasEnoughStake(address addr) public view returns(bool) {
    return depositsOf(addr) >= minAuditStake;
  }

  /**
   * @dev Overrides ConditionalTokenEscrow function. If true, funds may be withdrawn.
   * @param _payee The address that wants to withdraw funds.
   */
  function withdrawalAllowed(address _payee) public view returns (bool) {
    return !lockedFunds[_payee] || unlockBlockNumber[_payee] < block.number;
  }

  /**
   * @dev Prevents the payee from withdrawing funds.
   * @param _payee The address that will be locked.
   */
  function lockFunds(address _payee, uint256 _unlockBlockNumber) public onlyWhitelisted returns (bool) {
    lockedFunds[_payee] = true;
    unlockBlockNumber[_payee] = _unlockBlockNumber;
    return true;
  }
}
