import type { Connector } from "@infrascan/shared-types";

/**
 * In-memory connector. State is JSON round-tripped on write, matching the fs
 * and s3 connectors: Dates become strings, blobs become plain objects and
 * undefined members disappear. Scanners must cope with that shape, so the
 * fuzzer must reproduce it.
 */
export function createMemoryConnector(): Connector & {
  keys(): string[];
} {
  const store = new Map<string, string>();
  const key = (
    account: string,
    region: string,
    service: string,
    functionName: string,
  ) => [account, region, service, functionName].join("|");

  const serialize = (state: unknown) =>
    JSON.stringify(state, (_, value) =>
      typeof value === "bigint" ? Number(value) : value,
    );

  return {
    async onServiceScanCompleteCallback(
      account,
      region,
      service,
      functionName,
      state,
    ) {
      store.set(key(account, region, service, functionName), serialize(state));
    },

    async resolveStateForServiceFunction(
      account,
      region,
      service,
      functionName,
    ) {
      const raw = store.get(key(account, region, service, functionName));
      return raw != null ? JSON.parse(raw) : [];
    },

    async getGlobalStateForServiceFunction(service, functionName) {
      const suffix = `|${service}|${functionName}`;
      return [...store.entries()]
        .filter(([storedKey]) => storedKey.endsWith(suffix))
        .flatMap(([, raw]) => JSON.parse(raw));
    },

    keys() {
      return [...store.keys()];
    },
  };
}
