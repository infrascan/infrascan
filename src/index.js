const path = require("path");
const { performScan } = require("./scan");
const { generateGraph } = require("./graph");
const DEFAULT_CONFIG_PATH = "config.default.json";

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
      return await generateGraph();
    default:
      console.error(
        "Unknown command supplied. Currently only graph and scan are supported"
      );
      return;
  }
}
main();
