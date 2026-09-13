/**
 * Minimal hand-written ABI fragments — only the functions/events this agent
 * actually calls — kept in sync with `contracts/src/*.sol` by hand rather
 * than importing Foundry's generated `contracts/out/*.json` artifacts, since
 * `agent/` and `contracts/` are independent npm packages with no shared build
 * step. If a contract signature changes, update the matching entry here.
 */

export const watchmanVaultAbi = [
  {
    type: "function",
    name: "balances",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "policies",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "maxSpendPerTx", type: "uint256" },
      { name: "maxSpendPerDay", type: "uint256" },
      { name: "minHealthFactorBps", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "isAuthorizedAgent",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "agent", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "authorizeAgent",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setPolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "maxSpendPerTx", type: "uint256" },
      { name: "maxSpendPerDay", type: "uint256" },
      { name: "minHealthFactorBps", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "executeDefense",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "adapter", type: "address" },
      { name: "pool", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "DefenseExecuted",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "adapter", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export const mockLendingPoolAbi = [
  {
    type: "function",
    name: "healthFactor",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "collateralWeth", type: "uint256" },
      { name: "debtUsdc", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "depositCollateral",
    stateMutability: "nonpayable",
    inputs: [{ name: "wethAmount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "borrow",
    stateMutability: "nonpayable",
    inputs: [{ name: "usdcAmount", type: "uint256" }],
    outputs: [],
  },
] as const;

export const mockPriceFeedAbi = [
  {
    type: "function",
    name: "getPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "setPrice",
    stateMutability: "nonpayable",
    inputs: [{ name: "newPrice", type: "uint256" }],
    outputs: [],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
