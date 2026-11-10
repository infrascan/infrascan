# @infrascan/cli

The Infrascan CLI is a thin wrapper around the Infrascan SDK which outputs its state to the local file system.

The Infrascan CLI exposes four commands: scan, graph, render and state. A scan will read in all of the information that it can from your AWS account, and write it to your local file system. You can then run the graph command to take that scan output and convert it into an infrastructure diagram.

## Prerequisite

Infrascan requires read access to your AWS account to generate its graphs. Read access can be given by specifying a profile in your [AWS credentials file](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html), or by using the [default credential provider chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) and providing a role to assume.

## Quickstart

### Fastest Possible

Run a scan:

```sh
infrascan scan --region us-east-1
```

Generate a graph

```sh
infrascan graph
```

View it in browser:

```sh
infrascan render --browser
```

Or paste it into [render.infrascan.io](https://render.infrascan.io)

### Local state

By default the CLI is local-first: every scan is saved as a new snapshot in a standard per-user state directory, so you can run `infrascan` from anywhere and build up a history of scans over time.

| What | Default location | Overrides |
| --- | --- | --- |
| Scan state | `~/.local/state/infrascan` (`%LOCALAPPDATA%\infrascan\state` on Windows) | `INFRASCAN_HOME/state`, `XDG_STATE_HOME/infrascan` |
| Scan config | `~/.config/infrascan/config.json` (`%APPDATA%\infrascan\config.json` on Windows) | `INFRASCAN_HOME/config.json`, `XDG_CONFIG_HOME/infrascan/config.json` |

Run `infrascan state --paths` to print the locations in use.

Each snapshot lives in `scans/<scan id>/` and contains exactly what a legacy `-o` state directory contains (the per-service JSON files, `metadata.json` and, once graphed, `graph.json`), plus a `scan.json` describing the scan's status, timings and the config it ran with. `graph` and `render` pick up the latest completed scan automatically; pass `--scan <id>` (or a unique prefix of one) to use an older one.

```sh
infrascan state                       # list scans, newest first
infrascan state --prune 5             # keep the 5 most recent completed scans, remove failed ones
infrascan state --import ./state      # bring an existing state directory into the store
infrascan state --import-config config.json  # make an existing config the default for `infrascan scan`
```

Config is resolved in order: `--config`, then the saved config file, then a single account using your ambient AWS credentials. You can also save a config while scanning with `infrascan scan -c config.json --save-config`. Existing config files work unchanged.

The store records its layout version in `store.json`. Future versions of the CLI will migrate older stores in place, and older CLIs will refuse to touch a store written by a newer version rather than corrupt it.

Passing `-o`/`--input` explicitly keeps the previous behaviour of reading and writing a specific directory. If the store is empty and a `./state` directory exists, `graph` and `render` fall back to it with a warning.

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

The scan command takes our config file and, optionally, an output directory as arguments. Without an output directory the scan is stored in the local state directory (see above). With one, all of the state generated during the scan is written there instead.

```sh
infrascan scan -c config.json -o ./state
```

The state directory should contain JSON files in the format of: `<AccountID>-<Region>-<Service>-<FunctionCalled>.json`.

### Graph

To convert the latest stored scan into a graph, run `infrascan graph`. To graph a specific directory, pass it as the input:

```sh
infrascan graph --input ./state
```

The graph output will be saved to a `graph.json` file in the scan's state directory. The graph file contains an array of JSON objects representing the Nodes and Edges of the graph. This is formatted to be used with [cytoscape](https://js.cytoscape.org/), however it can be translated into any graphing library (Note: the graphs usually require on being able to create parent-child relationships)

You can view your graph by pasting the contents of your `graph.json` file into: [render.infrascan.io](https://render.infrascan.io).

To use the graph as data instead of rendering it (for example, giving it to an LLM or a script), pass `--serializer informational`:

```sh
infrascan graph --input ./state --serializer informational
```

The output keeps every scanned attribute of each node as plain JSON, including its parent id in `$graph.parent`. Edges reference their source and target nodes by id.
