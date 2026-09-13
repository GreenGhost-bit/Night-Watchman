import { describe, expect, it } from "vitest";
import { shouldDefend, sizeDefense } from "../src/cre/decision.js";
import { evaluateDefense } from "../src/cre/client.js";

/**
 * Proves the vendored copy in agent/src/cre/decision.ts behaves identically
 * to cre-workflow/src/decision.ts's own test fixtures (see that package's
 * test/decision.test.ts) — same threshold semantics, same sizing formula.
 * If you change the policy math, this file and cre-workflow/test/decision.test.ts
 * must both keep passing against the same inputs.
 */
describe("vendored CRE decision logic parity", () => {
  it("does not defend a healthy position", () => {
    expect(shouldDefend(0.5, 11_000)).toBe(false);
  });

  it("defends once risk ratio crosses the private threshold", () => {
    // minHealthFactorBps=11000 (HF 1.10) -> trigger riskRatio = 10000/11000 = 0.9091
    expect(shouldDefend(0.85, 11_000)).toBe(false);
    expect(shouldDefend(0.91, 11_000)).toBe(true);
  });

  it("treats the exact boundary as needing defense (inclusive)", () => {
    const triggerRiskRatio = 10_000 / 12_000;
    expect(shouldDefend(triggerRiskRatio, 12_000)).toBe(true);
  });

  it("sizes defense proportional to severity, capped by the spending cap and debt", () => {
    expect(sizeDefense(0.5, 10_000, 100_000)).toBeCloseTo(5_000);
    expect(sizeDefense(1.5, 10_000, 100_000)).toBeCloseTo(10_000); // severity clamped at 1
    expect(sizeDefense(1.0, 10_000, 2_000)).toBeCloseTo(2_000); // capped by policy
  });

  it("evaluateDefense composes both functions into the CRE workflow's output shape", () => {
    const authorized = evaluateDefense(0.95, 8_000, { minHealthFactorBps: 11_000, maxDefenseUsdc: 5_000 });
    expect(authorized.shouldDefend).toBe(true);
    expect(authorized.defenseAmountUsdc).toBeCloseTo(5_000);

    const notAuthorized = evaluateDefense(0.3, 8_000, { minHealthFactorBps: 11_000, maxDefenseUsdc: 5_000 });
    expect(notAuthorized.shouldDefend).toBe(false);
    expect(notAuthorized.defenseAmountUsdc).toBe(0);
  });
});
