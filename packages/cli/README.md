# @infrascan/cli

The Infrascan CLI is a thin wrapper around the Infrascan SDK which outputs its state to the local file system.

The Infrascan CLI exposes four commands: quickstart, scan, graph and render. A scan will read in all of the information that it can from your AWS account, and write it to your local file system. You can then run the graph command to take that scan output and convert it into an infrastructure diagram.

## Prerequisite

Infrascan requires read access to your AWS account to generate its graphs. Read access can be given by specifying a profile in your [AWS credentials file](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html), or by using the [default credential provider chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) and providing a role to assume.

## Quickstart

### Quickstart command

The `quickstart` command scans an environment (one or more AWS accounts, each with its own regions) and generates both graphs in one step:

```sh
infrascan quickstart
```

When run in a terminal, it prompts for anything you didn't pass as a flag:

1. Where to load credentials from: environment variables, a profile from your AWS config/credentials files, an IAM role to assume, or the default credential provider chain.
2. Which profile to use (when using a profile).
3. Which regions to scan. The default region from your AWS config is preselected. The credentials are checked before this step.
4. Whether to add another account to the environment. Steps 1 to 3 repeat for each account. An account that's already in the environment isn't added twice.
5. Whether to save the environment to a config file, so it can be reused with `infrascan quickstart -c` or `infrascan scan -c`.

An existing environment can be given with `--config`, in the same format as the [scan config file](#scan):

```sh
infrascan quickstart -c environment.json
```

A single account can also be given as flags, which mirror the `profile` and `roleToAssume` keys of the config file. `--region` applies to every account, including those in a config file:

```sh
infrascan quickstart --profile staging --region eu-west-1 --region us-east-1
infrascan quickstart --role-to-assume arn:aws:iam::000000000000:role/InfrascanReadOnly --region eu-west-1
infrascan quickstart --credential-source env --region eu-west-1
```

Outside of a terminal (e.g. in CI), anything not given falls back to the default credential provider chain and the default region.

While scanning, a single status line shows which service is being scanned in which region of which account. Verbose output from the scan is written to `quickstart.log` in the output directory instead of the terminal. If an account can't be scanned, the rest of the environment is still scanned and graphed, and the command exits with a non-zero code. Once complete, the output directory (`./state` by default, set with `--output`) contains:

- `graph.json`: the visual graph covering every account, which can be viewed with `infrascan render --browser`
- `graph.informational.json`: the informational graph (see [Graph](#graph))
- `metadata.json` and the raw scan state, which the `graph` command can read again later

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

### Scan

To run a scan command, we first need to create the config file. The config file describes an environment: which accounts to scan, how to authenticate with each, and which regions to scan in each. `infrascan quickstart` can write one for you. The config file format is:

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

Each entry is one account. Its credentials come from `profile`, then `roleToAssume`, then `"credentialSource": "env"` (environment variables). An entry with none of these uses the default credential provider chain. If `regions` is left out, every region is scanned.

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

To use the graph as data instead of rendering it (for example, giving it to an LLM or a script), pass `--serializer informational`:

```sh
infrascan graph --input ./state --serializer informational
```

The output keeps every scanned attribute of each node as plain JSON, including its parent id in `$graph.parent`. Edges reference their source and target nodes by id.
