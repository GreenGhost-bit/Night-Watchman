import { beforeEach, describe, expect, it } from "vitest";
import { getWatchtower } from "../src/graph/watchtower.js";

const ALL_ACCOUNTS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
  "0x6666666666666666666666666666666666666666",
  "0x7777777777777777777777777777777777777777",
  "0x8888888888888888888888888888888888888888",
  "0x9999999999999999999999999999999999999999",
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "0xcccccccccccccccccccccccccccccccccccccccc",
];

function findRisk(risks: Awaited<ReturnType<typeof getWatchtower>>, protocol: string, account: string) {
  const found = risks.find((r) => r.protocol === protocol && r.account === account);
  if (!found) throw new Error(`No PositionRisk found for ${protocol}/${account}`);
  return found;
}

describe("getWatchtower (fixture-mode end-to-end, real confirmed protocol IDs)", () => {
  beforeEach(() => {
    process.env.GRAPH_MODE = "fixture";
    process.env.GRAPH_AAVE_V3_SUBGRAPH_ID = "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk";
    process.env.GRAPH_COMPOUND_V3_SUBGRAPH_ID = "AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9";
    process.env.GRAPH_SPARK_SUBGRAPH_ID = "GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si";
    process.env.GRAPH_SEAMLESS_SUBGRAPH_ID = "2u4mWUV4xS19ef1MbnxZHWLLMwdPxtVifH46JbonXwXP";
    delete process.env.GRAPH_MORPHO_SUBGRAPH_ID;
  });

  it("returns correctly-normalized PositionRisk[] across at least 3 real, distinct protocols", async () => {
    const risks = await getWatchtower(ALL_ACCOUNTS);
    const protocols = new Set(risks.map((r) => r.protocol));

    expect(protocols.has("aave-v3")).toBe(true);
    expect(protocols.has("compound-v3")).toBe(true);
    expect(protocols.has("spark")).toBe(true);
    expect(protocols.has("seamless")).toBe(true);
    expect(protocols.size).toBeGreaterThanOrEqual(3);

    // Morpho Blue is intentionally unconfigured (no live subgraph confirmed) - must be skipped, not error.
    expect(protocols.has("morpho-blue")).toBe(false);
  });

  it("normalizes Aave v3 fixture accounts to the hand-computed riskRatios", async () => {
    const risks = await getWatchtower(ALL_ACCOUNTS);

    const healthy = findRisk(risks, "aave-v3", "0x1111111111111111111111111111111111111111");
    expect(healthy.collateralUSD).toBe(10000);
    expect(healthy.debtUSD).toBe(3000);
    expect(healthy.liquidationThresholdBps).toBe(8250);
    expect(healthy.riskRatio).toBeCloseTo(3000 / 8250, 10);
    expect(healthy.riskRatio).toBeLessThan(0.7);

    const nearLiquidation = findRisk(risks, "aave-v3", "0x2222222222222222222222222222222222222222");
    expect(nearLiquidation.riskRatio).toBeCloseTo(3800 / 4000, 10);
    expect(nearLiquidation.riskRatio).toBeGreaterThanOrEqual(0.9);
    expect(nearLiquidation.riskRatio).toBeLessThan(1);

    const underwater = findRisk(risks, "aave-v3", "0x3333333333333333333333333333333333333333");
    expect(underwater.riskRatio).toBeCloseTo(1600 / 1500, 10);
    expect(underwater.riskRatio).toBeGreaterThanOrEqual(1);
  });

  it("normalizes Compound v3 fixture accounts to the hand-computed riskRatios", async () => {
    const risks = await getWatchtower(ALL_ACCOUNTS);

    const healthy = findRisk(risks, "compound-v3", "0x4444444444444444444444444444444444444444");
    expect(healthy.riskRatio).toBeCloseTo(9000 / 16600, 10);

    const nearLiquidation = findRisk(risks, "compound-v3", "0x5555555555555555555555555555555555555555");
    expect(nearLiquidation.riskRatio).toBeCloseTo(3100 / 3120, 10);
    expect(nearLiquidation.riskRatio).toBeLessThan(1);

    const underwater = findRisk(risks, "compound-v3", "0x6666666666666666666666666666666666666666");
    expect(underwater.riskRatio).toBeGreaterThanOrEqual(1);
  });

  it("normalizes Spark fixture accounts, including a multi-market collateral-weighted threshold", async () => {
    const risks = await getWatchtower(ALL_ACCOUNTS);

    const deeplyUnderwater = findRisk(risks, "spark", "0x9999999999999999999999999999999999999999");
    expect(deeplyUnderwater.collateralUSD).toBe(500);
    expect(deeplyUnderwater.debtUSD).toBe(600);
    expect(deeplyUnderwater.liquidationThresholdBps).toBe(7700);
    expect(deeplyUnderwater.riskRatio).toBeCloseTo(600 / 385, 10);
    expect(deeplyUnderwater.riskRatio).toBeGreaterThan(1.5);
  });

  it("normalizes Seamless (Morpho Blue substitute) fixture accounts, including zero-debt and zero-collateral edge cases", async () => {
    const risks = await getWatchtower(ALL_ACCOUNTS);

    const healthy = findRisk(risks, "seamless", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(healthy.riskRatio).toBeCloseTo(2000 / 6400, 10);

    const zeroDebt = findRisk(risks, "seamless", "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(zeroDebt.collateralUSD).toBe(6500);
    expect(zeroDebt.debtUSD).toBe(0);
    expect(zeroDebt.riskRatio).toBe(0);

    const zeroCollateral = findRisk(risks, "seamless", "0xcccccccccccccccccccccccccccccccccccccccc");
    expect(zeroCollateral.collateralUSD).toBe(0);
    expect(zeroCollateral.debtUSD).toBe(750);
    expect(zeroCollateral.riskRatio).toBe(Infinity);
  });

  it("only returns positions for accounts actually in the requested watchlist", async () => {
    const risks = await getWatchtower(["0x1111111111111111111111111111111111111111"]);
    expect(risks.length).toBeGreaterThan(0);
    for (const r of risks) {
      expect(r.account).toBe("0x1111111111111111111111111111111111111111");
    }
  });

  it("skips protocols whose subgraph ID env var is unset (e.g. Morpho Blue) without throwing", async () => {
    delete process.env.GRAPH_SPARK_SUBGRAPH_ID;
    const risks = await getWatchtower(ALL_ACCOUNTS);
    expect(risks.some((r) => r.protocol === "spark")).toBe(false);
    expect(risks.some((r) => r.protocol === "aave-v3")).toBe(true);
  });
});
