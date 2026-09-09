import { describe, expect, it, vi } from "vitest";
import type { ProviderUsage } from "../../server/messages.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { ProviderUsageService } from "./service.js";

function quota(usedPct: number): ProviderUsage {
  return {
    providerId: "codex",
    displayName: "Codex",
    status: "available",
    planLabel: null,
    fetchedAt: new Date().toISOString(),
    windows: [{ id: "session", label: "Session", usedPct }],
  };
}

describe("native usage after a same-home credential relink", () => {
  it("clears the cached account once per completed login across shared clients", async () => {
    let current = quota(92);
    const fetchUsage = vi.fn(async () => current);
    const service = new ProviderUsageService({
      logger: createTestLogger(),
      fetchers: [{ providerId: "codex", displayName: "Codex", fetchUsage }],
      getProviderConfig: () => ({ codex: { env: { CODEX_HOME: "/synthetic/same-home" } } }),
    });
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(92);
    current = quota(12);
    service.invalidateForCredentialChange("completed-login");
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(12);
    service.invalidateForCredentialChange("completed-login");
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(12);
    expect(fetchUsage).toHaveBeenCalledTimes(2);
    current = quota(37);
    service.invalidateForCredentialChange("another-completed-login");
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(37);
    expect(fetchUsage).toHaveBeenCalledTimes(3);
  });

  it.each([false, true])(
    "old pending callers get current quota, with another client request=%s",
    async (anotherClient) => {
      let finishOld!: (value: ProviderUsage) => void;
      const old = new Promise<ProviderUsage>((resolve) => {
        finishOld = resolve;
      });
      const fetchUsage = vi
        .fn()
        .mockImplementationOnce(() => old)
        .mockResolvedValue(quota(12));
      const service = new ProviderUsageService({
        logger: createTestLogger(),
        fetchers: [{ providerId: "codex", displayName: "Codex", fetchUsage }],
        getProviderConfig: () => ({ codex: { env: { CODEX_HOME: "/synthetic/same-home" } } }),
      });
      const previous = service.listUsage();
      service.invalidateForCredentialChange("completed-login");
      if (anotherClient)
        expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(12);
      finishOld(quota(92));
      expect((await previous).providers[0].windows[0].usedPct).toBe(12);
      expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(12);
      expect(fetchUsage).toHaveBeenCalledTimes(2);
    },
  );
});
