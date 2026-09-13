import { describe, it, expect } from "vitest";
import { normalizePosition, computeRiskRatio, type RawAccountPositions } from "../src/risk/score.js";

describe("computeRiskRatio (pure formula)", () => {
  it("matches hand-computed value for a healthy position", () => {
    // debt=3000, collateral=10000, threshold=8000bps (80%)
    // adjustedCollateral = 10000 * 8000/10000 = 8000
    // riskRatio = 3000/8000 = 0.375
    expect(computeRiskRatio(3000, 10000, 8000)).toBeCloseTo(0.375, 10);
  });

  it("matches hand-computed value for an exactly-at-threshold position (riskRatio == 1)", () => {
    // adjustedCollateral = 5000 * 8000/10000 = 4000; debt = 4000 -> ratio = 1
    expect(computeRiskRatio(4000, 5000, 8000)).toBeCloseTo(1, 10);
  });

  it("matches hand-computed value for an underwater (liquidatable) position", () => {
    // adjustedCollateral = 2000 * 7500/10000 = 1500; debt = 1600 -> ratio = 1.0666...
    expect(computeRiskRatio(1600, 2000, 7500)).toBeCloseTo(1600 / 1500, 10);
    expect(computeRiskRatio(1600, 2000, 7500)).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 when there is no debt at all, regardless of collateral", () => {
    expect(computeRiskRatio(0, 10000, 8000)).toBe(0);
    expect(computeRiskRatio(0, 0, 0)).toBe(0);
  });

  it("returns Infinity when there is debt but zero usable collateral", () => {
    expect(computeRiskRatio(500, 0, 0)).toBe(Infinity);
    // zero liquidation threshold (e.g. collateral not enabled as collateral) also zeroes out adjustedCollateral
    expect(computeRiskRatio(500, 10000, 0)).toBe(Infinity);
  });
});

describe("normalizePosition (single shared normalization function, all protocols)", () => {
  it("aggregates multiple collateral + borrow positions into one PositionRisk (Aave-v3-shaped input)", () => {
    const raw: RawAccountPositions = {
      account: "0xabc",
      positions: [
        { side: "COLLATERAL", balanceUSD: 10000, liquidationThreshold: 82.5, marketName: "WETH" },
        { side: "BORROWER", balanceUSD: 3000, liquidationThreshold: 0, marketName: "USDC" },
      ],
    };
    const result = normalizePosition(raw, "aave-v3");
    expect(result.protocol).toBe("aave-v3");
    expect(result.account).toBe("0xabc");
    expect(result.collateralUSD).toBe(10000);
    expect(result.debtUSD).toBe(3000);
    // liquidationThreshold 82.5% -> 8250 bps
    expect(result.liquidationThresholdBps).toBe(8250);
    // riskRatio = 3000 / (10000 * 8250/10000) = 3000/8250
    expect(result.riskRatio).toBeCloseTo(3000 / 8250, 10);
  });

  it("produces the exact same shape/behavior for a differently-shaped protocol input (Compound-v3-shaped)", () => {
    const raw: RawAccountPositions = {
      account: "0xdef",
      positions: [
        {
          side: "COLLATERAL",
          balanceUSD: 4000,
          liquidationThreshold: 78,
          marketName: "Compound v3 USDC (WBTC collateral)",
        },
        {
          side: "BORROWER",
          balanceUSD: 3100,
          liquidationThreshold: 0,
          marketName: "Compound v3 USDC (WBTC collateral)",
        },
      ],
    };
    const result = normalizePosition(raw, "compound-v3");
    expect(result.collateralUSD).toBe(4000);
    expect(result.debtUSD).toBe(3100);
    expect(result.liquidationThresholdBps).toBe(7800);
    expect(result.riskRatio).toBeCloseTo(3100 / 3120, 10);
    expect(result.riskRatio).toBeLessThan(1); // still (barely) healthy
  });

  it("computes a collateral-weighted-average liquidation threshold across multiple collateral markets", () => {
    const raw: RawAccountPositions = {
      account: "0xmulti",
      positions: [
        { side: "COLLATERAL", balanceUSD: 6000, liquidationThreshold: 80, marketName: "WETH" },
        { side: "COLLATERAL", balanceUSD: 4000, liquidationThreshold: 70, marketName: "WBTC" },
        { side: "BORROWER", balanceUSD: 5000, liquidationThreshold: 0, marketName: "USDC" },
      ],
    };
    const result = normalizePosition(raw, "spark");
    expect(result.collateralUSD).toBe(10000);
    // weighted threshold = (6000*0.80 + 4000*0.70) / 10000 = (4800+2800)/10000 = 0.76 -> 7600bps
    expect(result.liquidationThresholdBps).toBe(7600);
    expect(result.riskRatio).toBeCloseTo(5000 / 7600, 10);
  });

  it("edge case: zero debt -> riskRatio is exactly 0", () => {
    const raw: RawAccountPositions = {
      account: "0xzerodebt",
      positions: [{ side: "COLLATERAL", balanceUSD: 6500, liquidationThreshold: 80, marketName: "cbETH" }],
    };
    const result = normalizePosition(raw, "seamless");
    expect(result.collateralUSD).toBe(6500);
    expect(result.debtUSD).toBe(0);
    expect(result.riskRatio).toBe(0);
  });

  it("edge case: zero collateral with nonzero debt -> riskRatio is Infinity (liquidatable)", () => {
    const raw: RawAccountPositions = {
      account: "0xzerocollateral",
      positions: [{ side: "BORROWER", balanceUSD: 750, liquidationThreshold: 0, marketName: "USDC" }],
    };
    const result = normalizePosition(raw, "seamless");
    expect(result.collateralUSD).toBe(0);
    expect(result.debtUSD).toBe(750);
    expect(result.liquidationThresholdBps).toBe(0);
    expect(result.riskRatio).toBe(Infinity);
    expect(result.riskRatio).toBeGreaterThanOrEqual(1);
  });

  it("edge case: no positions at all -> fully zeroed-out, non-liquidatable result", () => {
    const raw: RawAccountPositions = { account: "0xempty", positions: [] };
    const result = normalizePosition(raw, "aave-v3");
    expect(result).toEqual({
      protocol: "aave-v3",
      account: "0xempty",
      collateralUSD: 0,
      debtUSD: 0,
      liquidationThresholdBps: 0,
      riskRatio: 0,
    });
  });
});
