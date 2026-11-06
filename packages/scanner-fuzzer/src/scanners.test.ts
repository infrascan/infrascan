import t from "tap";
import {
  UnknownScannerError,
  resolveAllScanners,
  selectScanners,
} from "./scanners";

t.test("all AWS scanners are resolved from @infrascan/aws", async ({ ok }) => {
  const keys = resolveAllScanners().map((scanner) => scanner.key);
  ok(keys.length >= 17);
  for (const key of ["Lambda", "SQS", "EC2-Networking", "S3"]) {
    ok(keys.includes(key), `includes ${key}`);
  }
});

t.test(
  "scanners are selected by key or service, case-insensitively",
  async ({ same }) => {
    const all = resolveAllScanners();
    same(
      selectScanners(all, ["lambda", "EC2-NETWORKING"]).map((s) => s.key),
      ["EC2-Networking", "Lambda"],
    );
    same(
      selectScanners(all, ["ec2"]).map((s) => s.key),
      ["EC2-Networking"],
    );
    same(selectScanners(all), all);
  },
);

t.test(
  "unknown scanners are rejected with the available names",
  async ({ throws }) => {
    throws(
      () => selectScanners(resolveAllScanners(), ["lambda", "nope"]),
      UnknownScannerError,
    );
    throws(
      () => selectScanners(resolveAllScanners(), ["nope"]),
      /Available: .*Lambda/,
    );
  },
);
