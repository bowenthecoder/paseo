import type { Logger } from "pino";
import type { ProviderUsage } from "../../server/messages.js";
import type { CredentialFileReader } from "./credential-file.js";

export type ProviderApiFetch = typeof fetch;

export interface ProviderUsageFetcher {
  readonly providerId: string;
  readonly displayName: string;
  fetchUsage(): Promise<ProviderUsage>;
}

export interface ProviderUsageFetcherFactoryOptions {
  logger: Logger;
  fetch?: ProviderApiFetch;
  providerConfig?: Readonly<Record<string, unknown>>;
  environment?: NodeJS.ProcessEnv;
  credentialFileReader?: CredentialFileReader;
  claudeKeychainReader?: () => Promise<unknown | null>;
}

export interface ProviderUsageFetcherManifestEntry {
  readonly providerId: string;
  create(options: ProviderUsageFetcherFactoryOptions): ProviderUsageFetcher;
}
