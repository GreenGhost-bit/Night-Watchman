// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IProtocolAdapter} from "./interfaces/IProtocolAdapter.sol";
import {IHealthFactorSource} from "./interfaces/IHealthFactorSource.sol";

/// @title WatchmanVault
/// @notice Holds each user's own USDC and lets that user authorize agents to spend a capped,
///         policy-bounded amount of it on defending their lending positions. This is the
///         human-in-the-loop safety layer of the Lamplighter system: the agent can never
///         move a user's funds beyond what that specific user has pre-authorized, and only
///         when the user's own position is actually at risk. There is deliberately no global
///         owner/admin over user funds — every authorization and every cap is set by the user
///         whose money it is.
contract WatchmanVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice User-set safety policy governing what an authorized agent may spend for them.
    struct Policy {
        /// @notice Maximum USDC (6 decimals) an agent may spend in a single `executeDefense` call.
        uint256 maxSpendPerTx;
        /// @notice Maximum USDC (6 decimals) an agent may spend across any rolling 24h window.
        uint256 maxSpendPerDay;
        /// @notice Minimum acceptable health factor, in basis points (11000 == 1.10), below
        ///         which a defense is considered "needed". Above this, `executeDefense` reverts
        ///         rather than spend funds unnecessarily.
        uint256 minHealthFactorBps;
    }

    /// @dev Tracks an agent's rolling 24h spend for a given user, using a simple fixed-window
    ///      reset (window resets once 24h has elapsed since it started) rather than a sliding
    ///      window — sufficient for a demo-grade per-day cap.
    struct SpendWindow {
        uint256 windowStart;
        uint256 spentInWindow;
    }

    uint256 private constant SECONDS_PER_DAY = 1 days;
    uint256 private constant BPS_DENOMINATOR = 10_000;
    /// @dev Scales a basis-points health factor threshold (e.g. 11000) into the same 1e18
    ///      fixed-point scale `IHealthFactorSource.healthFactor` returns.
    uint256 private constant HEALTH_FACTOR_BPS_SCALE = 1e14; // 1e18 / 10_000

    /// @notice The USDC token this vault custodies (6 decimals).
    IERC20 public immutable USDC;

    /// @notice user => USDC balance held in the vault.
    mapping(address => uint256) public balances;
    /// @notice user => agent => whether that agent may call `executeDefense` for this user.
    mapping(address => mapping(address => bool)) public isAuthorizedAgent;
    /// @notice user => their configured safety policy.
    mapping(address => Policy) public policies;
    /// @notice user => rolling per-day spend tracker.
    mapping(address => SpendWindow) public spendWindows;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event AgentAuthorized(address indexed user, address indexed agent);
    event AgentRevoked(address indexed user, address indexed agent);
    event PolicySet(address indexed user, uint256 maxSpendPerTx, uint256 maxSpendPerDay, uint256 minHealthFactorBps);
    event DefenseExecuted(
        address indexed user,
        address indexed adapter,
        address indexed pool,
        uint256 amount,
        string reason,
        uint256 timestamp
    );

    error ZeroAmount();
    error InsufficientBalance();
    error NotAuthorizedAgent();
    error ExceedsPerTxCap();
    error ExceedsPerDayCap();
    error DefenseNotNeeded();
    error AdapterDefendFailed();

    constructor(address usdcAddress) {
        USDC = IERC20(usdcAddress);
    }

    /// @notice Deposit USDC into the caller's own vault balance.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw USDC from the caller's own, unspent vault balance.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();
        balances[msg.sender] -= amount;
        USDC.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Authorize `agent` to call `executeDefense` on the caller's behalf.
    function authorizeAgent(address agent) external {
        isAuthorizedAgent[msg.sender][agent] = true;
        emit AgentAuthorized(msg.sender, agent);
    }

    /// @notice Revoke a previously authorized agent.
    function revokeAgent(address agent) external {
        isAuthorizedAgent[msg.sender][agent] = false;
        emit AgentRevoked(msg.sender, agent);
    }

    /// @notice Set the caller's own safety policy governing agent spending.
    function setPolicy(uint256 maxSpendPerTx, uint256 maxSpendPerDay, uint256 minHealthFactorBps) external {
        policies[msg.sender] = Policy({
            maxSpendPerTx: maxSpendPerTx, maxSpendPerDay: maxSpendPerDay, minHealthFactorBps: minHealthFactorBps
        });
        emit PolicySet(msg.sender, maxSpendPerTx, maxSpendPerDay, minHealthFactorBps);
    }

    /// @notice Called by an agent `user` has authorized to defend `user`'s position on `pool`
    ///         via `adapter`. Enforces `user`'s policy caps and only proceeds if `pool`
    ///         reports a health factor below the user's configured minimum.
    /// @param user The user whose funds are being spent and whose position is being defended.
    /// @param adapter The `IProtocolAdapter` implementation to route the defense through.
    /// @param pool The protocol pool being defended; also read for the pre-check health factor.
    /// @param amount The amount of `usdc` to spend on the defense.
    /// @param reason Free-text rationale (e.g. from the off-chain risk agent) for the record.
    function executeDefense(address user, address adapter, address pool, uint256 amount, string calldata reason)
        external
        nonReentrant
    {
        if (!isAuthorizedAgent[user][msg.sender]) revert NotAuthorizedAgent();
        if (amount == 0) revert ZeroAmount();

        Policy memory policy = policies[user];

        if (amount > policy.maxSpendPerTx) revert ExceedsPerTxCap();

        SpendWindow storage window = spendWindows[user];
        if (block.timestamp >= window.windowStart + SECONDS_PER_DAY) {
            window.windowStart = block.timestamp;
            window.spentInWindow = 0;
        }
        if (window.spentInWindow + amount > policy.maxSpendPerDay) revert ExceedsPerDayCap();

        uint256 currentHealthFactor = IHealthFactorSource(pool).healthFactor(user);
        uint256 minHealthFactorScaled = policy.minHealthFactorBps * HEALTH_FACTOR_BPS_SCALE;
        if (currentHealthFactor >= minHealthFactorScaled) revert DefenseNotNeeded();

        if (balances[user] < amount) revert InsufficientBalance();

        window.spentInWindow += amount;
        balances[user] -= amount;

        // Emitted before the external adapter call so the log is ordered as an "effect"
        // rather than trailing an interaction; if the adapter call below fails, this whole
        // transaction (including this log) reverts, so it never misrepresents the outcome.
        emit DefenseExecuted(user, adapter, pool, amount, reason, block.timestamp);

        USDC.safeTransfer(adapter, amount);
        bool success = IProtocolAdapter(adapter).defend(pool, user, amount);
        if (!success) revert AdapterDefendFailed();
    }
}
