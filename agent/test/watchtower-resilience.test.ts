import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One Graph source going down must NOT blank the whole Watchtower.
 *
 * This is a regression test for a real failure hit during the build: Seamless
 * Protocol's indexers on The Graph's decentralized network began returning
 * BadResponse(400) to every query, including a bare `_meta`. Because
 * getWatchtower used Promise.all, that single bad source rejected the entire
 * sweep and the Watchtower — the view the whole composability story rests on
 * — rendered empty in live mode.
 *
 * Mocking lives in its own file because vi.mock is hoisted file-wide and
 * would otherwise interfere with the fixture-mode tests in watchtower.test.ts.
 */

const BROKEN_SUBGRAPH_ID = "2u4mWUV4xS19ef1MbnxZHWLLMwdPxtVifH46JbonXwXP"; // Seamless
const GATEWAY_ERROR =
  'The Graph gateway returned errors for subgraph 2u4mWUV4xS19ef1MbnxZHWLLMwdPxtVifH46JbonXwXP: ' +
  '[{"message":"bad indexers: {0x63c9dc729ba7a22bb8605216b24a34b902e5fe94: BadResponse(400)}"}]';

vi.mock("../src/graph/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/graph/client.js")>();
  return {
    ...actual,
    queryProtocolRisk: vi.fn(async (subgraphId: string, accounts: string[]) => {
      if (subgraphId === BROKEN_SUBGRAPH_ID) throw new Error(GATEWAY_ERROR);
      return actual.queryProtocolRisk(subgraphId, accounts);
    }),
  };
});

const { getWatchtower, getWatchtowerWithStatus } = await import("../src/graph/watchtower.js");

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

describe("watchtower resilience — one dead source must not blank the dashboard", () => {
  beforeEach(() => {
    process.env.GRAPH_MODE = "fixture";
    process.env.GRAPH_AAVE_V3_SUBGRAPH_ID = "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk";
    process.env.GRAPH_COMPOUND_V3_SUBGRAPH_ID = "AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9";
    process.env.GRAPH_SPARK_SUBGRAPH_ID = "GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si";
    process.env.GRAPH_SEAMLESS_SUBGRAPH_ID = BROKEN_SUBGRAPH_ID;
    delete process.env.GRAPH_MORPHO_SUBGRAPH_ID;
    vi.clearAllMocks();
  });

  it("still returns every healthy protocol when one subgraph's indexers fail", async () => {
    const risks = await getWatchtower(ALL_ACCOUNTS);

    const protocols = [...new Set(risks.map((r) => r.protocol))].sort();
    expect(protocols).toEqual(["aave-v3", "compound-v3", "spark"]);
    expect(risks.length).toBeGreaterThan(0);
  });

  it("reports per-source status so the UI can label which feeds are degraded", async () => {
    const { positions, sources } = await getWatchtowerWithStatus(ALL_ACCOUNTS);

    expect(positions.length).toBeGreaterThan(0);

    const seamless = sources.find((s) => s.protocol === "seamless");
    expect(seamless?.ok).toBe(false);
    expect(seamless?.positionCount).toBe(0);
    expect(seamless?.error).toContain("bad indexers");

    const healthy = sources.filter((s) => s.ok).map((s) => s.protocol).sort();
    expect(healthy).toEqual(["aave-v3", "compound-v3", "spark"]);
  });

  it("counts positions per source so the dashboard can show coverage honestly", async () => {
    const { positions, sources } = await getWatchtowerWithStatus(ALL_ACCOUNTS);

    const summed = sources.reduce((acc, s) => acc + s.positionCount, 0);
    expect(summed).toBe(positions.length);
  });

  it("surfaces an all-sources-down sweep as empty data, not a thrown error", async () => {
    delete process.env.GRAPH_AAVE_V3_SUBGRAPH_ID;
    delete process.env.GRAPH_COMPOUND_V3_SUBGRAPH_ID;
    delete process.env.GRAPH_SPARK_SUBGRAPH_ID;

    const { positions, sources } = await getWatchtowerWithStatus(ALL_ACCOUNTS);

    expect(positions).toEqual([]);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ protocol: "seamless", ok: false, positionCount: 0 });
  });
});
