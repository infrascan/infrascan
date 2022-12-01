const AWS = require("aws-sdk");
const path = require("path");
const fs = require("fs");
const { scanResourcesInAccount } = require("./scan");
const { SERVICES_CONFIG: SERVICES } = require("./services");
const { generateServiceMap } = require("./graph");
const { whoami, METADATA_PATH } = require("./utils");
const DEFAULT_REGION = "us-east-1";
const DEFAULT_CONFIG_PATH = "config.default.json";

// TODO: move more logic into scan
async function scan(config) {
  const { global, regional } = SERVICES.reduce(
    (filteredServices, currentService) => {
      if (currentService.global) {
        filteredServices.global.push(currentService);
      } else {
        filteredServices.regional.push(currentService);
      }
      return filteredServices;
    },
    { global: [], regional: [] }
  );

  const scanMetadata = {};
  for (let accountConfig of config) {
    const { profile, regions, services } = accountConfig;
    const credentials = new AWS.SharedIniFileCredentials({
      profile,
    });
    AWS.config.update({ credentials, region: DEFAULT_REGION });
    const globalCaller = await whoami();

    if (!scanMetadata[globalCaller.Account]) {
      scanMetadata[globalCaller.Account] = new Set();
    }
    console.log(`Scanning global resources in ${globalCaller.Account}`);
    if (services?.length > 0) {
      const filteredGlobalServices = global.filter(({ service }) =>
        services.includes(service)
      );
      await scanResourcesInAccount(
        globalCaller.Account,
        "us-east-1",
        filteredGlobalServices
      );
    } else {
      await scanResourcesInAccount(globalCaller.Account, "us-east-1", global);
    }

    for (let region of regions) {
      AWS.config.update({
        region,
      });
      const caller = await whoami();
      console.log(`Beginning scan of ${caller.Account} in ${region}`);
      const servicesToScan = services ?? [];
      if (servicesToScan.length > 0) {
        console.log(`Filtering services according to supplied list`, {
          servicesToScan,
        });
        const filteredRegionalServices = regional.filter(({ service }) =>
          servicesToScan.includes(service)
        );
        await scanResourcesInAccount(
          caller.Account,
          region,
          filteredRegionalServices
        );
      } else {
        await scanResourcesInAccount(caller.Account, region, regional);
      }
      console.log(`Scan of ${caller.Account} in ${region} complete`);
      scanMetadata[caller.Account].add(region);
    }
  }
  const serializableMetadataEntries = Object.entries(scanMetadata).map(
    ([k, regionSet]) => [k, Array.from(regionSet)]
  );
  const serializableMetadata = Object.fromEntries(serializableMetadataEntries);
  fs.writeFileSync(
    METADATA_PATH,
    JSON.stringify(serializableMetadata, undefined, 2)
  );
}

// TODO: refactor graph to allow for use of config files:
// - Read scan metadata file to build out root nodes (account, region)
// - Iterate over services, use glob selector to get all retrieved info (any account, any region)
// - Generate nodes under acc and region
// - Generate edges
async function graph(config) {
  for (let accountConfig of config) {
    const { account, regions, services } = accountConfig;
    await generateServiceMap(account, services);
    for (let region of regions) {
      AWS.config.update({
        region,
        credentials,
      });
      const caller = await whoami();
      if (caller.Account !== account) {
        console.warn(
          `WARNING! Account given in config (${account}) does not match account returned in caller identity (${caller.Account})`
        );
      }
      console.log(`Generating graph of ${caller.Account}`);
      await generateServiceMap(caller.Account, region, services);
      console.log(`Graph gen of ${caller.Account} complete`);
    }
  }
}

function getConfig() {
  const givenPath = process.env.CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
  return path.join(process.env.PWD, givenPath);
}

async function main() {
  const command = process.argv.slice(2);
  if (command.length === 0) {
    console.error(
      "No command given. Use scan to begin a scan of your AWS account, or graph to generate a new infrastructure graph"
    );
    return;
  }
  const config = require(getConfig());
  switch (command[0].toLowerCase()) {
    case "scan":
      return await scan(config);
    case "graph":
      return await graph(config);
    default:
      console.error(
        "Unknown command supplied. Currently only graph and scan are supported"
      );
      return;
  }
}
main();
