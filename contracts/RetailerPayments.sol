// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title RetailerPayments
/// @notice A USDC payment router for Retailer QR payments with direct payer-to-merchant transfers.
/// @dev This contract has no admin functions, no fee logic, and no escrow.
contract RetailerPayments {
    /// @notice Reverts when `merchant` is the zero address.
    error ZeroMerchant();

    /// @notice Reverts when `amount` is zero.
    error ZeroAmount();

    /// @notice Reverts when `sessionId` is bytes32(0).
    error ZeroSessionId();

    /// @notice Reverts when the USDC `transferFrom` call returns false.
    error TransferFailed();

    /// @notice Emitted when a payment is sent from payer to merchant.
    /// @param merchant The merchant receiving funds.
    /// @param payer The payer whose USDC was transferred.
    /// @param sessionId The off-chain payment session identifier.
    /// @param amount The USDC amount transferred.
    event PaymentReceived(
        address indexed merchant,
        address indexed payer,
        bytes32 indexed sessionId,
        uint256 amount
    );

    /// @notice The USDC token used for payments.
    IERC20 public immutable usdc;

    /// @notice Creates the payment router with a fixed USDC token address.
    /// @param usdcToken The USDC ERC-20 token address.
    constructor(address usdcToken) {
        usdc = IERC20(usdcToken);
    }

    /// @notice Pays a merchant in USDC using `transferFrom` from the caller.
    /// @dev Caller must approve this contract for at least `amount` USDC before calling.
    /// @param merchant The merchant recipient address.
    /// @param sessionId The off-chain payment session identifier.
    /// @param amount The USDC amount to transfer.
    function pay(address merchant, bytes32 sessionId, uint256 amount) external {
        if (merchant == address(0)) revert ZeroMerchant();
        if (amount == 0) revert ZeroAmount();
        if (sessionId == bytes32(0)) revert ZeroSessionId();

        bool ok = usdc.transferFrom(msg.sender, merchant, amount);
        if (!ok) revert TransferFailed();

        emit PaymentReceived(merchant, msg.sender, sessionId, amount);
    }
}
