import { registerAwsScanners } from "@infrascan/aws";
import type { ServiceModule } from "@infrascan/shared-types";

export type AwsScanner = ServiceModule<unknown, "aws">;

/**
 * Every AWS scanner Infrascan ships, resolved through `@infrascan/aws` so the
 * fuzzer always covers exactly the set the CLI registers, with no list to keep
 * in sync.
 */
export function resolveAllScanners(): AwsScanner[] {
  const scanners: AwsScanner[] = [];
  const collector = {
    registerScanner(scanner: AwsScanner) {
      scanners.push(scanner);
    },
  };
  registerAwsScanners(
    collector as unknown as Parameters<typeof registerAwsScanners>[0],
  );
  return scanners;
}

/**
 * The names a scanner can be selected by: its key (e.g. `EC2-Networking`), and
 * its service (e.g. `ec2`).
 */
export function scannerNames(scanner: AwsScanner): string[] {
  return [scanner.key, scanner.service];
}

export class UnknownScannerError extends Error {
  constructor(unknown: string[], available: AwsScanner[]) {
    super(
      `Unknown scanner(s): ${unknown.join(", ")}. Available: ${available
        .map((scanner) => scanner.key)
        .join(", ")}`,
    );
    this.name = "UnknownScannerError";
  }
}

/**
 * Select scanners by key or service name, case-insensitively. A service name
 * selects every scanner for that service. No names selects everything.
 */
export function selectScanners(
  available: AwsScanner[],
  names: string[] = [],
): AwsScanner[] {
  if (names.length === 0) {
    return available;
  }
  const wanted = names.map((name) => name.toLowerCase());
  const matches = (scanner: AwsScanner, name: string) =>
    scannerNames(scanner).some((candidate) => candidate.toLowerCase() === name);

  const unknown = names.filter(
    (_, idx) => !available.some((scanner) => matches(scanner, wanted[idx])),
  );
  if (unknown.length > 0) {
    throw new UnknownScannerError(unknown, available);
  }
  return available.filter((scanner) =>
    wanted.some((name) => matches(scanner, name)),
  );
}
