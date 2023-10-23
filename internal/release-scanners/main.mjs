import core from "@actions/core";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * @typedef Workspace
 * @property {string} normalizedPath
 * @property {string} name
 */

/**
 * @param {string} workspaceName
 * @returns {Workspace} workspace
 */
function buildWorkspace(workspaceName) {
  const normalizedPath = new URL(`../../${workspaceName}`, import.meta.url)
    .pathname;
  return {
    normalizedPath,
    name: workspaceName,
  };
}

export const PACKAGE_DIRECTORIES = {
  awsScanners: buildWorkspace("aws-scanners"),
  packages: buildWorkspace("packages"),
};

/**
 * @typedef PackageInfo
 * @property {string} name
 * @property {string} workspace
 * @property {boolean | undefined} isPrivate
 */

/**
 * Finds the package.json for a directory and returns the package info
 * @param {Workspace} workspace
 * @param {string} childDirectory
 * @returns {PackageInfo | undefined}
 */
export function getPackageInfo(workspace, childDirectory) {
  try {
    const packageJson = readFileSync(
      join(workspace.normalizedPath, childDirectory, "package.json"),
      "utf-8",
    );
    const parsedJSON = JSON.parse(packageJson);
    return {
      workspace: `${workspace.name}/${childDirectory}`,
      name: parsedJSON.name,
      isPrivate: parsedJSON.private,
    };
  } catch (err) {
    core.error(
      `Failed to resolve PackageInfo for ${workspace.name}/${childDirectory} - ${err.message}`,
    );
    return;
  }
}

/**
 * Find all scanners in a directory
 * @param {Workspace} searchDirectory
 * @param {string} releaseTag
 * @returns {PackageInfo | undefined} Information for all AWS Scanners
 */
export function tryFindReleaseCandidateInDirectory(
  searchDirectory,
  releaseTag,
) {
  try {
    const packages = readdirSync(searchDirectory.normalizedPath, {
      withFileTypes: true,
      recursive: false,
    });
    for (const candidatePackage of packages) {
      if (candidatePackage.isDirectory()) {
        const packageInfo = getPackageInfo(
          searchDirectory,
          candidatePackage.name,
        );
        if (releaseTag.includes(packageInfo.name)) {
          // We have found a release candidate, if it's private log a warning and continue the search
          if (packageInfo.isPrivate) {
            core.error(
              `Found private package as a potential release candidate - ${packageInfo.name}`,
            );
          } else {
            return packageInfo;
          }
        }
      }
    }
  } catch (err) {
    core.error(
      `An error occurred while attempting to find a release candidate in ${searchDirectory.name} - ${err.message}`,
    );
    return;
  }
}

export function findReleaseCandidate() {
  const releaseTag = core.getInput("release-tag");
  // If release tag begins with `@infrascan/aws-` then its a scanner module
  // This avoids searching the wrong directory for the aggregate AWS package (@infrascan/aws)
  const searchDirectory = releaseTag.includes("@infrascan/aws-")
    ? PACKAGE_DIRECTORIES.awsScanners
    : PACKAGE_DIRECTORIES.packages;
  const releaseCandidate = tryFindReleaseCandidateInDirectory(
    searchDirectory,
    releaseTag,
  );
  if (releaseCandidate) {
    core.setOutput("release-candidate-found", true);
    core.setOutput("candidate-package", releaseCandidate.name);
    core.setOutput("candidate-workspace", releaseCandidate.workspace);
  } else {
    core.info(`No release candidate found for ${releaseTag}`);
    core.setOutput("release-candidate-found", false);
  }
}
