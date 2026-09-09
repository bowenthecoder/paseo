import { homedir } from "node:os";
import { join } from "node:path";
import { ProviderOverrideSchema } from "@getpaseo/protocol/provider-config";
import type {
  ProviderUsageFetcher,
  ProviderUsageFetcherFactoryOptions,
  ProviderUsageFetcherManifestEntry,
} from "./provider.js";
import { ClaudeQuotaProvider } from "./providers/claude.js";
import { CodexQuotaProvider } from "./providers/codex.js";
import { CopilotQuotaProvider } from "./providers/copilot.js";
import { CursorQuotaProvider } from "./providers/cursor.js";
import { GrokQuotaProvider } from "./providers/grok.js";
import { KimiQuotaProvider } from "./providers/kimi.js";
import { MiniMaxQuotaProvider } from "./providers/minimax.js";
import { ZaiQuotaProvider } from "./providers/zai.js";
import { unavailableUsage } from "./usage.js";

function subscriptionFetcher(
  providerId: "claude" | "codex",
  options: ProviderUsageFetcherFactoryOptions,
): ProviderUsageFetcher {
  const config = ProviderOverrideSchema.safeParse(options.providerConfig?.[providerId] ?? {});
  const environment = {
    ...(options.environment ?? process.env),
    ...(config.success ? config.data.env : {}),
  };
  const apiRouted =
    providerId === "claude"
      ? Boolean(
          environment.ANTHROPIC_API_KEY ||
          environment.ANTHROPIC_AUTH_TOKEN ||
          environment.ANTHROPIC_BASE_URL,
        )
      : Boolean(environment.OPENAI_API_KEY || environment.OPENAI_BASE_URL);
  if (!config.success || apiRouted) {
    return {
      providerId,
      displayName: providerId === "claude" ? "Claude" : "Codex",
      async fetchUsage() {
        return unavailableUsage(this);
      },
    };
  }
  return providerId === "claude"
    ? new ClaudeQuotaProvider({
        logger: options.logger,
        fetch: options.fetch,
        claudeHome: environment.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
        credentialFileReader: options.credentialFileReader,
        claudeKeychainReader: options.claudeKeychainReader,
      })
    : new CodexQuotaProvider({
        logger: options.logger,
        fetch: options.fetch,
        codexHome: environment.CODEX_HOME || join(homedir(), ".codex"),
        credentialFileReader: options.credentialFileReader,
      });
}

export const PROVIDER_USAGE_FETCHERS: readonly ProviderUsageFetcherManifestEntry[] = [
  {
    providerId: "claude",
    create: (options) => subscriptionFetcher("claude", options),
  },
  {
    providerId: "codex",
    create: (options) => subscriptionFetcher("codex", options),
  },
  {
    providerId: "copilot",
    create: (options) => new CopilotQuotaProvider({ logger: options.logger, fetch: options.fetch }),
  },
  {
    providerId: "cursor",
    create: (options) => new CursorQuotaProvider({ logger: options.logger, fetch: options.fetch }),
  },
  {
    providerId: "zai",
    create: (options) => new ZaiQuotaProvider({ logger: options.logger, fetch: options.fetch }),
  },
  {
    providerId: "grok",
    create: (options) => new GrokQuotaProvider({ logger: options.logger, fetch: options.fetch }),
  },
  {
    providerId: "kimi",
    create: (options) => new KimiQuotaProvider({ logger: options.logger, fetch: options.fetch }),
  },
  {
    providerId: "minimax",
    create: (options) => new MiniMaxQuotaProvider({ logger: options.logger, fetch: options.fetch }),
  },
];

export function createProviderUsageFetchers(
  options: ProviderUsageFetcherFactoryOptions,
): ProviderUsageFetcher[] {
  return PROVIDER_USAGE_FETCHERS.map((entry) => entry.create(options));
}
