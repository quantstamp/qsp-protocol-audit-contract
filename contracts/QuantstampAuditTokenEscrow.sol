pragma solidity 0.4.25;

import "./token_escrow/ConditionalTokenEscrow.sol";
import "./LinkedListLib.sol";


contract QuantstampAuditTokenEscrow is ConditionalTokenEscrow {

  // the escrow maintains the list of staked addresses
  using LinkedListLib for LinkedListLib.LinkedList;

  // constants used by LinkedListLib
  uint256 constant internal NULL = 0;
  uint256 constant internal HEAD = 0;
  bool constant internal PREV = false;
  bool constant internal NEXT = true;

  // maintain the number of staked nodes
  // saves gas cost over needing to call stakedNodesList.sizeOf()
  uint256 public stakedNodesCount = 0;

  // the minimum amount of wei-QSP that must be staked in order to be a node
  uint256 public minAuditStake = 10000 * (10 ** 18);

  // if true, the payee cannot currently withdraw their funds
  mapping(address => bool) public lockedFunds;

  // if funds are locked, they may be retrieved after this block
  // if funds are unlocked, the number should be ignored
  mapping(address => uint256) public unlockBlockNumber;

  // staked audit nodes -- needed to inquire about audit node statistics, such as min price
  // this list contains all nodes that have *ANY* stake, however when getNextStakedNode is called,
  // it skips nodes that do not meet the minimum stake.
  // the reason for this approach is that if the owner lowers the minAuditStake,
  // we must be aware of any node with a stake.
  LinkedListLib.LinkedList internal stakedNodesList;

  event Slashed(address addr, uint256 amount);
  event StakedNodeAdded(address addr);
  event StakedNodeRemoved(address addr);

  // the constructor of TokenEscrow requires an ERC20, not an address
  constructor(address tokenAddress) public TokenEscrow(ERC20(tokenAddress)) {} // solhint-disable no-empty-blocks

  /**
  * @dev Puts in escrow a certain amount of tokens as credit to be withdrawn.
  *      Overrides the function in TokenEscrow.sol to add the payee to the staked list.
  * @param _payee The destination address of the tokens.
  * @param _amount The amount of tokens to deposit in escrow.
  */
  function deposit(address _payee, uint256 _amount) public onlyWhitelisted {
    super.deposit(_payee, _amount);
    if (_amount > 0) {
      // fails gracefully if the node already exists
      addNodeToStakedList(_payee);
    }
  }

 /**
  * @dev Withdraw accumulated tokens for a payee.
  *      Overrides the function in TokenEscrow.sol to remove the payee from the staked list.
  * @param _payee The address whose tokens will be withdrawn and transferred to.
  */
  function withdraw(address _payee) public onlyWhitelisted {
    super.withdraw(_payee);
    removeNodeFromStakedList(_payee);
  }

  /**
   * @dev Sets the minimum stake to a new value.
   * @param _value The new value. _value must be greater than zero in order for the linked list to be maintained correctly.
   */
  function setMinAuditStake(uint256 _value) public onlyOwner {
    require(_value > 0);
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

    /**
   * @dev Slash a percentage of the stake of an address.
   *      The percentage is taken from the minAuditStake, not the total stake of the address.
   *      The caller of this function receives the slashed QSP.
   *      If the current stake does not cover the slash amount, the full stake is taken.
   *
   * @param addr The address that will be slashed.
   * @param percentage The percent of the minAuditStake that should be slashed.
   */
  function slash(address addr, uint256 percentage) public onlyWhitelisted returns (uint256) {
    require(0 <= percentage && percentage <= 100);

    uint256 slashAmount = getSlashAmount(percentage);
    uint256 balance = depositsOf(addr);
    if (balance < slashAmount) {
      slashAmount = balance;
    }

    // subtract from the deposits amount of the addr
    deposits[addr] = deposits[addr].sub(slashAmount);

    emit Slashed(addr, slashAmount);

    // if the deposits of the address are now zero, remove from the list
    if (depositsOf(addr) == 0) {
      removeNodeFromStakedList(addr);
    }

    // transfer the slashAmount to the police contract
    token.safeTransfer(msg.sender, slashAmount);

    return slashAmount;
  }

  /**
   * @dev Returns the slash amount for a given percentage.
   * @param percentage The percent of the minAuditStake that should be slashed.
   */
  function getSlashAmount(uint256 percentage) public view returns (uint256) {
    return (minAuditStake.mul(percentage)).div(100);
  }

  /**
   * @dev Given a staked address, returns the next address from the list that meets the minAuditStake.
   * @param addr The staked address.
   * @return The next address in the list.
   */
  function getNextStakedNode(address addr) public view returns(address) {
    bool exists;
    uint256 next;
    (exists, next) = stakedNodesList.getAdjacent(uint256(addr), NEXT);
    // only return addresses that meet the minAuditStake
    while (exists && next != HEAD && !hasEnoughStake(address(next))) {
      (exists, next) = stakedNodesList.getAdjacent(next, NEXT);
    }
    return address(next);
  }

  /**
   * @dev Adds an address to the stakedNodesList.
   * @param addr The address to be added to the list.
   * @return true if the address was added to the list.
   */
  function addNodeToStakedList(address addr) internal returns(bool success) {
    if (stakedNodesList.insert(HEAD, uint256(addr), PREV)) {
      stakedNodesCount++;
      emit StakedNodeAdded(addr);
      success = true;
    }
  }

  /**
   * @dev Removes an address from the stakedNodesList.
   * @param addr The address to be removed from the list.
   * @return true if the address was removed from the list.
   */
  function removeNodeFromStakedList(address addr) internal returns(bool success) {
    if (stakedNodesList.remove(uint256(addr)) != 0) {
      stakedNodesCount--;
      emit StakedNodeRemoved(addr);
      success = true;
    }
  }
}
