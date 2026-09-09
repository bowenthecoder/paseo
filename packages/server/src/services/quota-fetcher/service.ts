import type { Logger } from "pino";
import equal from "fast-deep-equal";
import type { ProviderUsage } from "../../server/messages.js";
import { createProviderUsageFetchers } from "./manifest.js";
import type {
  ProviderApiFetch,
  ProviderUsageFetcher,
  ProviderUsageFetcherFactoryOptions,
} from "./provider.js";
import { unavailableUsage } from "./usage.js";

export interface ProviderUsageServiceOptions {
  logger: Logger;
  fetchers?: ProviderUsageFetcher[];
  fetch?: ProviderApiFetch;
  cacheTtlMs?: number;
  now?: () => number;
  getProviderConfig?: () => NonNullable<ProviderUsageFetcherFactoryOptions["providerConfig"]>;
  createFetchers?: typeof createProviderUsageFetchers;
}

export interface ProviderUsageListResult {
  fetchedAt: string;
  providers: ProviderUsage[];
}

const DEFAULT_PROVIDER_USAGE_CACHE_TTL_MS = 5 * 60 * 1000;

export class ProviderUsageService {
  private readonly logger: Logger;
  private fetchers: ProviderUsageFetcher[];
  private readonly getProviderConfig: ProviderUsageServiceOptions["getProviderConfig"];
  private readonly createFetchers: () => ProviderUsageFetcher[];
  private providerConfig: NonNullable<ProviderUsageFetcherFactoryOptions["providerConfig"]>;
  private configurationVersion = 0;
  private readonly credentialChanges = new Set<string>();
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cached: { fetchedAtMs: number; result: ProviderUsageListResult } | null = null;
  private inFlight: Promise<ProviderUsageListResult> | null = null;

  constructor(options: ProviderUsageServiceOptions) {
    this.logger = options.logger.child({ module: "provider-usage-service" });
    this.getProviderConfig = options.getProviderConfig;
    this.providerConfig = this.getProviderConfig?.() ?? {};
    this.createFetchers = () =>
      options.fetchers ??
      (options.createFetchers ?? createProviderUsageFetchers)({
        logger: this.logger,
        fetch: options.fetch,
        providerConfig: this.providerConfig,
      });
    this.fetchers = this.createFetchers();
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_PROVIDER_USAGE_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  private refreshProviderConfiguration(): void {
    const config = this.getProviderConfig?.();
    if (config && !equal(config, this.providerConfig)) {
      this.providerConfig = config;
      this.fetchers = this.createFetchers();
      this.configurationVersion += 1;
      this.cached = null;
      this.inFlight = null;
    }
  }

  /** A completed login may replace the account without changing its configured home. */
  invalidateForCredentialChange(changeId: string): void {
    if (this.credentialChanges.has(changeId)) return;
    this.credentialChanges.add(changeId);
    // Multiple clients can observe the same completed login. Bound deduplication history.
    if (this.credentialChanges.size > 256) {
      const oldest = this.credentialChanges.values().next().value;
      if (oldest !== undefined) this.credentialChanges.delete(oldest);
    }
    this.configurationVersion += 1;
    this.fetchers = this.createFetchers();
    this.cached = null;
    this.inFlight = null;
  }

  async listUsage(options?: { forceRefresh?: boolean }): Promise<ProviderUsageListResult> {
    this.refreshProviderConfiguration();
    const nowMs = this.now();
    if (
      !options?.forceRefresh &&
      this.cached &&
      nowMs - this.cached.fetchedAtMs < this.cacheTtlMs
    ) {
      return this.cached.result;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    const request = this.fetchFreshUsage(nowMs, this.fetchers, this.configurationVersion);
    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) {
        this.inFlight = null;
      }
    }
  }

  private async fetchFreshUsage(
    nowMs: number,
    fetchers: ProviderUsageFetcher[],
    configurationVersion: number,
  ): Promise<ProviderUsageListResult> {
    const settled = await Promise.allSettled(fetchers.map((fetcher) => fetcher.fetchUsage()));
    this.refreshProviderConfiguration();
    // Callers also need the current account: returning a superseded response could
    // replace a newer client's query result even when this service keeps its cache.
    if (configurationVersion !== this.configurationVersion) return this.listUsage();
    const providers = settled.map((result, index) => {
      const fetcher = fetchers[index];
      if (result.status === "fulfilled") {
        return result.value;
      }
      this.logger.debug(
        { err: result.reason, providerId: fetcher.providerId },
        "Provider usage fetch failed",
      );
      return unavailableUsage({
        providerId: fetcher.providerId,
        displayName: fetcher.displayName,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });

    const result = { fetchedAt: new Date(nowMs).toISOString(), providers };
    this.cached = { fetchedAtMs: nowMs, result };
    return result;
  }
}
