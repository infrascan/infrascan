const AWS = require("aws-sdk");
const { scanResourcesInAccount } = require("./scan");
const { generateServiceMap } = require("./graph");
const { whoami } = require("./utils");
const DEFAULT_REGION = "us-east-1";

AWS.config.update({
  region: DEFAULT_REGION,
});

async function scan() {
  const caller = await whoami();
  console.log(`Beginning scan of ${caller.Account}`);
  await scanResourcesInAccount(caller.Account, DEFAULT_REGION);
  console.log(`Scan of ${caller.Account} complete`);
}

async function graph() {
  const caller = await whoami();
  console.log(`Generating graph of ${caller.Account}`);
  await generateServiceMap(caller.Account, DEFAULT_REGION);
  console.log(`Graph gen of ${caller.Account} complete`);
}

async function main() {
  const command = process.argv.slice(2);
  if (command.length === 0) {
    console.error(
      "No command given. Use scan to begin a scan of your AWS account, or graph to generate a new infrastructure graph"
    );
    return;
  }
  switch (command[0].toLowerCase()) {
    case "scan":
      return await scan();
    case "graph":
      return await graph();
    default:
      console.error(
        "Unknown command supplied. Currently only graph and scan are supported"
      );
      return;
  }
}
main();
