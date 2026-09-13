import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep this scoped to the plain vitest suite. Any future bun-only test
    // file (e.g. one exercising a fake TeeRuntime the way Chainlink's own
    // templates do under `bun:test`) should live outside `test/` so it isn't
    // picked up here and doesn't need bun to be present for `npm test`.
    include: ["test/**/*.test.ts"],
  },
});
