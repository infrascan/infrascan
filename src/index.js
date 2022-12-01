const AWS = require("aws-sdk");
const path = require("path");
const { performScan } = require("./scan");
const { generateServiceMap, generateGraph } = require("./graph");
const { whoami } = require("./utils");
const DEFAULT_CONFIG_PATH = "config.default.json";

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
      return await performScan(config);
    case "graph":
      // return await graph(config);
      return await generateGraph();
    default:
      console.error(
        "Unknown command supplied. Currently only graph and scan are supported"
      );
      return;
  }
}
main();
