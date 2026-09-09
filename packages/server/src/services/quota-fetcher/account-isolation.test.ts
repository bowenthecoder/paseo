import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderOverrideSchema } from "@getpaseo/protocol/provider-config";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { PROVIDER_USAGE_FETCHERS } from "./manifest.js";
import type { ProviderUsageFetcherFactoryOptions } from "./provider.js";
import { ClaudeQuotaProvider, readClaudeKeychainCredentials } from "./providers/claude.js";
import { CodexQuotaProvider } from "./providers/codex.js";
import { ProviderUsageService } from "./service.js";

const logger = createTestLogger();
const homeA = "/synthetic/account-a";
const homeB = "/synthetic/account-b";
const quota = (used: number) =>
  new Response(JSON.stringify({ rate_limit: { primary_window: { used_percent: used } } }));
const codexCredential = (token: string) => ({ tokens: { access_token: token } });
const claudeCredential = (token: string) => ({ claudeAiOauth: { accessToken: token } });

function subscriptionFetchers(options: ProviderUsageFetcherFactoryOptions) {
  return PROVIDER_USAGE_FETCHERS.filter(
    (entry) => entry.providerId === "claude" || entry.providerId === "codex",
  ).map((entry) => entry.create(options));
}

describe("native quota credential isolation", () => {
  it("reads only the requested Codex home, including when that home is not signed in", async () => {
    const files: string[] = [];
    const requests: string[] = [];
    const provider = new CodexQuotaProvider({
      logger,
      codexHome: homeB,
      credentialFileReader: async (file) => {
        files.push(file);
        return null;
      },
      fetch: async (url) => {
        requests.push(String(url));
        return quota(10);
      },
    });
    expect((await provider.fetchUsage()).status).toBe("unavailable");
    expect(files).toEqual([join(homeB, "auth.json")]);
    expect(requests).toEqual([]);
  });

  it("keeps Claude's configured credential file separate from default keychain fallback", async () => {
    const files: string[] = [];
    const tokens: string[] = [];
    let keychainReads = 0;
    const provider = new ClaudeQuotaProvider({
      logger,
      claudeHome: homeB,
      credentialFileReader: async (file) => {
        files.push(file);
        return claudeCredential("synthetic-b");
      },
      claudeKeychainReader: async () => {
        keychainReads++;
        return claudeCredential("synthetic-a");
      },
      fetch: async (_url, init) => {
        tokens.push(new Headers(init?.headers).get("Authorization") ?? "");
        return new Response(JSON.stringify({ five_hour: { utilization: 12 } }));
      },
    });
    expect((await provider.fetchUsage()).windows[0].usedPct).toBe(12);
    expect(files).toEqual([join(homeB, ".credentials.json")]);
    expect(tokens).toEqual(["Bearer synthetic-b"]);
    expect(keychainReads).toBe(0);
  });

  it("never reads the legacy Claude keychain service for a custom profile", async () => {
    const services: string[] = [];
    const legacy = "Claude Code-credentials";
    const result = await readClaudeKeychainCredentials(
      async (args) => {
        const service = args.at(-1)!;
        services.push(service);
        return service === legacy ? JSON.stringify(claudeCredential("synthetic-default")) : null;
      },
      "synthetic-user",
      homeB,
    );
    expect(result).toBeNull();
    const own = `${legacy}-${createHash("sha256").update(homeB).digest("hex").slice(0, 8)}`;
    expect(services).toEqual([own, own]);
  });

  it("preserves the default profile's legacy Claude keychain support", async () => {
    const legacy = "Claude Code-credentials";
    const result = await readClaudeKeychainCredentials(
      async (args) =>
        args.at(-1) === legacy ? JSON.stringify(claudeCredential("synthetic-default")) : null,
      "synthetic-user",
      join(homedir(), ".claude"),
    );
    expect(result).toEqual(claudeCredential("synthetic-default"));
  });

  it("manifest fetchers honor built-in profile overrides ahead of inherited homes", async () => {
    const files: string[] = [];
    const fetchers = subscriptionFetchers({
      logger,
      environment: { CODEX_HOME: homeA, CLAUDE_CONFIG_DIR: homeA },
      providerConfig: {
        codex: { env: { CODEX_HOME: homeB } },
        claude: { env: { CLAUDE_CONFIG_DIR: homeB } },
      },
      credentialFileReader: async (file) => {
        files.push(file);
        return file.endsWith("/.credentials.json")
          ? claudeCredential("synthetic-b")
          : codexCredential("synthetic-b");
      },
      claudeKeychainReader: async () => null,
      fetch: async (url) =>
        String(url).includes("anthropic")
          ? new Response(JSON.stringify({ five_hour: { utilization: 12 } }))
          : quota(12),
    });
    expect(
      (await Promise.all(fetchers.map((fetcher) => fetcher.fetchUsage()))).map(
        (usage) => usage.windows[0].usedPct,
      ),
    ).toEqual([12, 12]);
    expect(files).toEqual([join(homeB, ".credentials.json"), join(homeB, "auth.json")]);
  });

  it("API-routed Codex does not read subscription credentials or hide Claude usage", async () => {
    const files: string[] = [];
    const fetchers = subscriptionFetchers({
      logger,
      environment: { OPENAI_API_KEY: "synthetic-api", CLAUDE_CONFIG_DIR: homeB },
      credentialFileReader: async (file) => {
        files.push(file);
        return claudeCredential("synthetic-b");
      },
      claudeKeychainReader: async () => null,
      fetch: async () => new Response(JSON.stringify({ five_hour: { utilization: 12 } })),
    });
    expect(
      (await Promise.all(fetchers.map((fetcher) => fetcher.fetchUsage()))).map(
        (usage) => usage.status,
      ),
    ).toEqual(["available", "unavailable"]);
    expect(files).toEqual([join(homeB, ".credentials.json")]);
  });

  it("drops cached quota immediately after built-in account configuration changes", async () => {
    let config = { codex: { env: { CODEX_HOME: homeA } } };
    const reads: string[] = [];
    const service = new ProviderUsageService({
      logger,
      getProviderConfig: () => config,
      createFetchers: (options) => [
        new CodexQuotaProvider({
          logger,
          codexHome: ProviderOverrideSchema.parse(options.providerConfig?.codex ?? {}).env
            ?.CODEX_HOME,
          credentialFileReader: async (file) => {
            reads.push(file);
            return codexCredential(file.includes("account-b") ? "b" : "a");
          },
          fetch: async (_url, init) =>
            quota(new Headers(init?.headers).get("Authorization") === "Bearer b" ? 12 : 92),
        }),
      ],
    });
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(92);
    config = { codex: { env: { CODEX_HOME: homeB } } };
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(12);
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(12);
    expect(reads).toEqual([join(homeA, "auth.json"), join(homeB, "auth.json")]);
  });

  it("late requests from the previous account cannot replace the new account's cache", async () => {
    let config = { codex: { env: { CODEX_HOME: homeA } } };
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    let finishFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      finishFirst = resolve;
    });
    let requests = 0;
    const service = new ProviderUsageService({
      logger,
      getProviderConfig: () => config,
      createFetchers: (options) => [
        new CodexQuotaProvider({
          logger,
          codexHome: ProviderOverrideSchema.parse(options.providerConfig?.codex ?? {}).env
            ?.CODEX_HOME,
          credentialFileReader: async (file) =>
            codexCredential(file.includes("account-b") ? "b" : "a"),
          fetch: async (_url, init) => {
            requests++;
            if (new Headers(init?.headers).get("Authorization") === "Bearer b") return quota(12);
            firstStarted();
            return first;
          },
        }),
      ],
    });
    const previousRequest = service.listUsage();
    await started;
    config = { codex: { env: { CODEX_HOME: homeB } } };
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(12);
    finishFirst(quota(92));
    expect((await previousRequest).providers[0].windows[0].usedPct).toBe(12);
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(12);
    expect(requests).toBe(2);
  });

  it("detects account changes during a request even without a second caller", async () => {
    let config = { codex: { env: { CODEX_HOME: homeA } } };
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    let finishFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      finishFirst = resolve;
    });
    let requests = 0;
    const service = new ProviderUsageService({
      logger,
      getProviderConfig: () => config,
      createFetchers: (options) => [
        new CodexQuotaProvider({
          logger,
          codexHome: ProviderOverrideSchema.parse(options.providerConfig?.codex ?? {}).env
            ?.CODEX_HOME,
          credentialFileReader: async (file) =>
            codexCredential(file.includes("account-b") ? "b" : "a"),
          fetch: async (_url, init) => {
            requests++;
            if (new Headers(init?.headers).get("Authorization") === "Bearer b") return quota(12);
            firstStarted();
            return first;
          },
        }),
      ],
    });
    const pending = service.listUsage();
    await started;
    config = { codex: { env: { CODEX_HOME: homeB } } };
    finishFirst(quota(92));
    expect((await pending).providers[0].windows[0].usedPct).toBe(12);
    expect((await service.listUsage()).providers[0].windows[0].usedPct).toBe(12);
    expect(requests).toBe(2);
  });
});
