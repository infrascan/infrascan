const { performScan } = require("@infrascan/sdk");
const path = require("path");
const {
  buildFilePathForServiceCall,
  recordServiceCall,
  resolveStateForServiceCall,
  writeScanMetadata,
} = require("../utils");
const {
  fromIni,
  fromTemporaryCredentials,
} = require("@aws-sdk/credential-providers");
const DEFAULT_CONFIG_PATH = "config.default.json";

function getConfig() {
  const givenPath = process.env.CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
  return path.join(process.env.PWD, givenPath);
}

function writeStateToFs(account, region, service, functionName, functionState) {
  const filePath = buildFilePathForServiceCall(
    account,
    region,
    service,
    functionName
  );
  recordServiceCall(filePath, functionState);
}

function resolveCredentials(profile, roleToAssume) {
  if (profile) {
    return fromIni({
      profile,
    });
  } else if (roleToAssume) {
    return fromTemporaryCredentials({
      params: {
        RoleArn: roleToAssume,
        RoleSessionName: "infrascan-cli-scan",
      },
    });
  }
}

async function runScan() {
  const scanConfig = require(getConfig());
  const metadata = [];
  for (let accountConfig of scanConfig) {
    // Resolving credentials is left up to the SDK — performing a full scan can take some time, so the SDK may need to refresh credentials.
    const { profile, roleToAssume, regions, services } = accountConfig;
    const credentials = resolveCredentials(profile, roleToAssume);
    const accountMetadata = await performScan({
      credentials,
      regions,
      services,
      onServiceScanComplete: writeStateToFs,
      resolveStateForServiceCall,
    });
    metadata.push(accountMetadata);
  }
  writeScanMetadata(metadata);
}

module.exports = runScan;
