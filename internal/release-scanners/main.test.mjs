import { test } from "tap";
import {
  PACKAGE_DIRECTORIES,
  getPackageInfo,
  tryFindReleaseCandidateInDirectory,
} from "./main.mjs";

test("getPackageInfo - valid public scanner", (tap) => {
  const packageInfo = getPackageInfo(
    PACKAGE_DIRECTORIES.awsScanners,
    "api-gateway",
  );
  tap.equal(
    packageInfo.workspace,
    `${PACKAGE_DIRECTORIES.awsScanners.name}/api-gateway`,
  );
  tap.equal(packageInfo.name, "@infrascan/aws-api-gateway-scanner");
  tap.notOk(packageInfo.isPrivate);
  tap.end();
});

test("getPackageInfo - valid private package", (tap) => {
  const packageInfo = getPackageInfo(
    PACKAGE_DIRECTORIES.awsScanners,
    "codegen",
  );
  tap.equal(
    packageInfo.workspace,
    `${PACKAGE_DIRECTORIES.awsScanners.name}/codegen`,
  );
  tap.equal(packageInfo.name, "@infrascan/aws-codegen");
  tap.ok(packageInfo.isPrivate);
  tap.end();
});

test("getPackageInfo - valid public package", (tap) => {
  const packageInfo = getPackageInfo(PACKAGE_DIRECTORIES.packages, "sdk");
  tap.equal(packageInfo.workspace, `${PACKAGE_DIRECTORIES.packages.name}/sdk`);
  tap.equal(packageInfo.name, "@infrascan/sdk");
  tap.notOk(packageInfo.isPrivate);
  tap.end();
});

test("getPackageInfo - nonexistant package", (tap) => {
  const packageInfo = getPackageInfo(
    PACKAGE_DIRECTORIES.packages,
    "thispackagedoesntexist",
  );
  tap.notOk(packageInfo);
  tap.end();
});

test("tryFindReleaseCandidateInDirectory - valid public package", (tap) => {
  const packageInfo = tryFindReleaseCandidateInDirectory(
    PACKAGE_DIRECTORIES.packages,
    "@infrascan/sdk@0.1.0",
  );
  tap.equal(packageInfo.workspace, "packages/sdk");
  tap.equal(packageInfo.name, "@infrascan/sdk");
  tap.notOk(packageInfo.isPrivate);
  tap.end();
});

test("tryFindReleaseCandidateInDirectory - valid scanner", (tap) => {
  const packageInfo = tryFindReleaseCandidateInDirectory(
    PACKAGE_DIRECTORIES.awsScanners,
    "@infrascan/aws-ecs-scanner@0.1.0",
  );
  tap.equal(packageInfo.workspace, "aws-scanners/ecs");
  tap.equal(packageInfo.name, "@infrascan/aws-ecs-scanner");
  tap.notOk(packageInfo.isPrivate);
  tap.end();
});

test("tryFindReleaseCandidateInDirectory - private package", (tap) => {
  const packageInfo = tryFindReleaseCandidateInDirectory(
    PACKAGE_DIRECTORIES.awsScanners,
    "@infrascan/aws-codegen@0.1.0",
  );
  tap.ok(packageInfo == null);
  tap.end();
});

test("tryFindReleaseCandidateInDirectory - nonexistant package", (tap) => {
  const packageInfo = tryFindReleaseCandidateInDirectory(
    PACKAGE_DIRECTORIES.awsScanners,
    "@infrascan/packagethatdoesnotexist@0.1.0",
  );
  tap.ok(packageInfo == null);
  tap.end();
});

test("tryFindReleaseCandidateInDirectory - invalid workspace", (tap) => {
  const packageInfo = tryFindReleaseCandidateInDirectory(
    { name: "broken-workspace" },
    "@infrascan/packagethatdoesnotexist@0.1.0",
  );
  tap.notOk(packageInfo);
  tap.end();
});
