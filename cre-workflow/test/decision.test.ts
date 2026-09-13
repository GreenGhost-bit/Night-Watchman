import { describe, expect, test } from "vitest";
import { shouldDefend, sizeDefense } from "../src/decision";

// A representative policy: defend once health factor implied by riskRatio
// drops to 1.20 (12000 bps) or below -- i.e. once riskRatio climbs to
// 10000 / 12000 = 0.8333... -- well before the hard liquidation line at
// riskRatio = 1.
const MIN_HEALTH_FACTOR_BPS = 12_000; // HF 1.20
const TRIGGER_RISK_RATIO = 10_000 / MIN_HEALTH_FACTOR_BPS; // 0.8333...
const MAX_DEFENSE_USDC = 5_000;
const DEBT_USD = 10_000;

describe("shouldDefend", () => {
  test("healthy position (low riskRatio) does not trigger a defense", () => {
    expect(shouldDefend(0.3, MIN_HEALTH_FACTOR_BPS)).toBe(false);
  });

  test("position well inside the safety margin does not trigger", () => {
    // riskRatio just below the trigger point
    expect(shouldDefend(TRIGGER_RISK_RATIO - 0.05, MIN_HEALTH_FACTOR_BPS)).toBe(false);
  });

  test("position crossing the private threshold triggers a defense", () => {
    expect(shouldDefend(TRIGGER_RISK_RATIO + 0.05, MIN_HEALTH_FACTOR_BPS)).toBe(true);
  });

  test("boundary: exactly at the threshold triggers (inclusive)", () => {
    expect(shouldDefend(TRIGGER_RISK_RATIO, MIN_HEALTH_FACTOR_BPS)).toBe(true);
  });

  test("boundary: one ulp below the threshold does not trigger", () => {
    const justBelow = TRIGGER_RISK_RATIO - Number.EPSILON * TRIGGER_RISK_RATIO * 4;
    expect(shouldDefend(justBelow, MIN_HEALTH_FACTOR_BPS)).toBe(false);
  });

  test("already-liquidatable position (riskRatio >= 1) always triggers", () => {
    expect(shouldDefend(1.0, MIN_HEALTH_FACTOR_BPS)).toBe(true);
    expect(shouldDefend(2.5, MIN_HEALTH_FACTOR_BPS)).toBe(true);
  });

  test("a stricter (higher) minHealthFactorBps triggers earlier", () => {
    const conservative = shouldDefend(0.9, 15_000); // HF 1.50 floor
    const lax = shouldDefend(0.9, 10_500); // HF 1.05 floor
    expect(conservative).toBe(true);
    expect(lax).toBe(false);
  });

  test("non-finite or non-positive riskRatio is treated as safe", () => {
    expect(shouldDefend(0, MIN_HEALTH_FACTOR_BPS)).toBe(false);
    expect(shouldDefend(-1, MIN_HEALTH_FACTOR_BPS)).toBe(false);
    expect(shouldDefend(Number.NaN, MIN_HEALTH_FACTOR_BPS)).toBe(false);
  });

  test("rejects a non-positive policy threshold", () => {
    expect(() => shouldDefend(0.9, 0)).toThrow();
    expect(() => shouldDefend(0.9, -100)).toThrow();
  });
});

describe("sizeDefense", () => {
  test("healthy position sizes a small, proportional amount", () => {
    const amount = sizeDefense(0.3, DEBT_USD, MAX_DEFENSE_USDC);
    expect(amount).toBeCloseTo(0.3 * DEBT_USD, 6);
    expect(amount).toBeLessThan(MAX_DEFENSE_USDC);
  });

  test("position crossing the threshold sizes a sensible mid-size amount (below the cap)", () => {
    const riskRatio = TRIGGER_RISK_RATIO + 0.05; // ~0.883
    const generousCap = 20_000; // cap deliberately not the binding constraint here
    const amount = sizeDefense(riskRatio, DEBT_USD, generousCap);
    expect(amount).toBeCloseTo(riskRatio * DEBT_USD, 6);
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThan(DEBT_USD);
  });

  test("position crossing the threshold is capped once the private spend limit binds", () => {
    const riskRatio = TRIGGER_RISK_RATIO + 0.05; // ~0.883 -> raw ~8833
    const amount = sizeDefense(riskRatio, DEBT_USD, MAX_DEFENSE_USDC); // cap 5000
    expect(amount).toBe(MAX_DEFENSE_USDC);
  });

  test("severely underwater position caps at maxDefenseUsdc, never exceeding it", () => {
    // riskRatio far past 1 would naively call for the full debt, but the
    // private spending cap must win.
    const amount = sizeDefense(3.0, DEBT_USD, MAX_DEFENSE_USDC);
    expect(amount).toBe(MAX_DEFENSE_USDC);
  });

  test("never recommends defending for more than the outstanding debt", () => {
    // Cap is larger than the debt itself -- should still not exceed debtUSD.
    const amount = sizeDefense(1.0, 1_000, 5_000);
    expect(amount).toBe(1_000);
  });

  test("boundary: exactly at riskRatio = 1 sizes up to the full debt (bounded by cap)", () => {
    const amount = sizeDefense(1.0, DEBT_USD, MAX_DEFENSE_USDC);
    expect(amount).toBe(MAX_DEFENSE_USDC); // debt (10000) > cap (5000)
  });

  test("boundary: riskRatio just above 1 does not exceed the riskRatio=1 sizing", () => {
    const atOne = sizeDefense(1.0, DEBT_USD, 20_000);
    const pastOne = sizeDefense(1.4, DEBT_USD, 20_000);
    expect(atOne).toBe(DEBT_USD);
    expect(pastOne).toBe(DEBT_USD); // severity clamps at 1 -> same as debt
  });

  test("zero or negative inputs size to zero defense", () => {
    expect(sizeDefense(0, DEBT_USD, MAX_DEFENSE_USDC)).toBe(0);
    expect(sizeDefense(0.5, 0, MAX_DEFENSE_USDC)).toBe(0);
    expect(sizeDefense(0.5, DEBT_USD, 0)).toBe(0);
    expect(sizeDefense(-1, DEBT_USD, MAX_DEFENSE_USDC)).toBe(0);
    expect(sizeDefense(0.5, -100, MAX_DEFENSE_USDC)).toBe(0);
  });

  test("non-finite inputs size to zero defense rather than throwing", () => {
    expect(sizeDefense(Number.NaN, DEBT_USD, MAX_DEFENSE_USDC)).toBe(0);
    expect(sizeDefense(0.5, Number.NaN, MAX_DEFENSE_USDC)).toBe(0);
    expect(sizeDefense(0.5, DEBT_USD, Number.NaN)).toBe(0);
  });
});

describe("shouldDefend + sizeDefense integration", () => {
  test("end-to-end: healthy position -> no defense", () => {
    const riskRatio = 0.4;
    const authorize = shouldDefend(riskRatio, MIN_HEALTH_FACTOR_BPS);
    expect(authorize).toBe(false);
    const amount = authorize ? sizeDefense(riskRatio, DEBT_USD, MAX_DEFENSE_USDC) : 0;
    expect(amount).toBe(0);
  });

  test("end-to-end: position crossing threshold -> defends with a sensible amount", () => {
    const riskRatio = 0.9;
    const authorize = shouldDefend(riskRatio, MIN_HEALTH_FACTOR_BPS);
    expect(authorize).toBe(true);
    const amount = authorize ? sizeDefense(riskRatio, DEBT_USD, MAX_DEFENSE_USDC) : 0;
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThanOrEqual(MAX_DEFENSE_USDC);
  });

  test("end-to-end: severely underwater -> defends up to but not exceeding the cap", () => {
    const riskRatio = 5.0;
    const authorize = shouldDefend(riskRatio, MIN_HEALTH_FACTOR_BPS);
    expect(authorize).toBe(true);
    const amount = authorize ? sizeDefense(riskRatio, DEBT_USD, MAX_DEFENSE_USDC) : 0;
    expect(amount).toBe(MAX_DEFENSE_USDC);
    expect(amount).toBeLessThanOrEqual(MAX_DEFENSE_USDC);
  });
});
