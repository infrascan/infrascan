/**
 * Facts read from a landing zone manifest. The manifest schema changes between landing zone versions, so every field
 * is optional and read defensively.
 */
export interface ManifestFacts {
  governedRegions?: string[];
  /** `centralizedLogging.accountId` */
  logArchiveAccountId?: string;
  /** `securityRoles.accountId` */
  auditAccountId?: string;
  /** `config.accountId`, present in newer manifests that configure AWS Config separately */
  configAccountId?: string;
  /** `organizationStructure`, as returned */
  organizationStructure?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" ? String(value) : undefined;
}

function parse(manifest: unknown): Record<string, unknown> | undefined {
  if (typeof manifest === "string") {
    try {
      return asRecord(JSON.parse(manifest));
    } catch {
      return undefined;
    }
  }
  return asRecord(manifest);
}

export function extractManifest(manifest: unknown): ManifestFacts {
  const root = parse(manifest);
  if (root == null) {
    return {};
  }
  const governedRegions = Array.isArray(root.governedRegions)
    ? root.governedRegions.filter(
        (region): region is string => typeof region === "string",
      )
    : undefined;
  return {
    governedRegions,
    logArchiveAccountId: asString(asRecord(root.centralizedLogging)?.accountId),
    auditAccountId: asString(asRecord(root.securityRoles)?.accountId),
    configAccountId: asString(asRecord(root.config)?.accountId),
    organizationStructure: asRecord(root.organizationStructure),
  };
}
