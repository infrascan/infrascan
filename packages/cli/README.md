# @infrascan/cli

The Infrascan CLI is a thin wrapper around the Infrascan SDK which outputs its state to the local file system.

The Infrascan CLI exposes two commands: scan and graph. A scan will read in all of the information that it can from your AWS account, and write it to your local file system. You can then run the graph command to take that scan output and convert it into an infrastructure diagram. 

## Prerequisite

Infrascan requires read access to your AWS account to generate its graphs. Read access can be given by specifying a profile in your [AWS credentials file](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html), or by using the [default credential provider chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) and providing a role to assume.

## Quickstart

### Scan

To run a scan command, we first need to create the config file. The config file will tell the CLI which regions to scan, and how to authenticate with AWS. The config file format is:

```json
[
  {
    "regions": ["eu-west-1", "us-east-1"],
    "profile": "infrascan-read-access-staging"
  },
  {
    "regions": ["eu-west-1"],
    "roleToAssume": "arn:aws:iam::000000000000:role/InfrascanReadOnlyRolePreProd"
  }
]
```

The scan command takes our config file and an output directory as arguments. The output directory is where all of the state generated during the scan will be written. This will be used by our graph command to produce an infrastructure diagram.

```sh
infrascan scan -c config.json -o ./state
```

The state directory should contain JSON files in the format of: `<AccountID>-<Region>-<Service>-<FunctionCalled>.json`.

### Graph

To convert the scan output into a graph, we run the graph command passing the scan output directory as our input:

```sh
infrascan graph --input ./state
```

The graph output will be saved to a `graph.json` file in the state directory. The graph file contains an array of JSON objects representing the Nodes and Edges of the graph. This is formatted to be used with [cytoscape](https://js.cytoscape.org/), however it can be translated into any graphing library (Note: the graphs usually require on being able to create parent-child relationships)

You can view your graph by pasting the contents of your `graph.json` file into: [render.infrascan.io](https://render.infrascan.io).