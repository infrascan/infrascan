# @infrascan/scanner-fuzzer

An internal (unpublished) tool that looks for runtime failures in the Infrascan
AWS scanners and SDK, the kind that only show up against real accounts whose
API responses don't match what a scanner assumed.

Unit tests cover the responses we thought of. The fuzzer covers the ones we
didn't: optional properties that are missing, empty lists, odd-but-valid values
(IAM `NotResource` statements, `PendingConfirmation` SNS subscriptions, URL
encoded policies), resources that reference each other, and API calls that fail
for lack of permissions.

## How it works

- **Responses come from the AWS SDK's own schemas.** Every SDK v3 command
  carries a Smithy schema of its output. The fuzzer generates a response from
  it, randomly dropping optional members and sizing lists, and fills in
  realistic values based on member names (ARNs, policy documents, identifiers).
- **The real SDK runs end to end.** API calls are intercepted at the Smithy
  base client's `send`, so `Infrascan.performScan` and `generateGraph` run
  unmodified, including the STS, EC2 and IAM clients the SDK creates itself.
  Nothing reaches the network, and the original `send` is restored afterwards.
- **Every scanner extension point is instrumented.** Getters, IAM role and edge
  resolution, and each entity component run inside a wrapper that records
  failures against the stage they happened in. By default failures are then
  contained, so one bad resource doesn't hide the next. `--propagate` lets them
  propagate, to see what a real run does with them.
- **State is JSON round-tripped**, as the fs and s3 connectors do, so scanners
  see the same shape of state as in production.
- **Every iteration draws a profile** (how many optional members are present,
  how often lists are empty, how often calls fail, whether identifiers are
  drawn from shared pools so references resolve).
- **Runs are reproducible.** Each iteration is seeded from the run's seed and
  its index, so a single iteration can be replayed on its own.

Scanners are resolved through `@infrascan/aws`, so the fuzzer always covers
exactly the scanners the CLI registers.

## Usage

Build the workspace first, the fuzzer runs against the built packages:

```sh
pnpm build:all
pnpm fuzz -n 500
# or, from this directory
node --enable-source-maps dist/cli.js -n 500
```

```
infrascan-fuzz [run|list] [options]

  -n, --iterations <n>   Iterations to run (default: 200)
  -s, --seed <n>         Seed for the run (default: 1)
  -i, --iteration <n>    Run only this iteration of the seeded run, to reproduce a finding
      --scanner <name>   Scanner key or service to fuzz, repeatable (default: all)
      --propagate        Let scanner failures propagate as they would in a real run
      --call-budget <n>  Max API calls per iteration before reporting a pagination loop
      --min-severity <s> Lowest severity to report: fatal, crash, warning
      --fail-on <s>      Exit non-zero at this severity: fatal, crash, warning, none (default: crash)
      --format <f>       text or json
  -o, --output <file>    Write the report to a file
  -v, --verbose          Include stack frames
```

`infrascan-fuzz list` prints the scanners that can be selected with `--scanner`,
by key (`EC2-Networking`) or service (`ec2`).

### Reading the report

```
[fatal] sdk:generateGraph (sdk) x28
    Cannot read properties of undefined (reading 'split')
    at getServiceFromArn (packages/sdk/dist/index.js:251:29)
    repro: infrascan-fuzz --seed 7 --iteration 11
```

| Severity  | Meaning                                                                                       |
| --------- | --------------------------------------------------------------------------------------------- |
| `fatal`   | `performScan` or `generateGraph` threw: the user gets no result.                              |
| `crash`   | Scanner code threw. Contained by the fuzzer; may or may not abort a real run (`--propagate`). |
| `warning` | Nothing threw, but data was lost: the SDK logged an error, or a node/edge/role was malformed. |

Findings are grouped by stage, location and message (with run-specific data
such as ARNs stripped), and list the first iteration they appeared in. The
`repro` command replays that iteration. Responses depend on the selected
scanners, so it includes the same `--scanner` flags.

Stack locations point at the built `dist` files. Build the scanners with
`--sourcemap` and run with `--enable-source-maps` to get source locations.

Not every finding is a bug users will hit. The generator knows the schema, not
AWS's behaviour, so a finding that depends on AWS omitting a resource's primary
identifier is unlikely in practice. Judge each against the real API.

## Programmatic use

```ts
import { runFuzzer, formatText } from "@infrascan/scanner-fuzzer";

const report = await runFuzzer({ iterations: 100, seed: 3, scanners: ["sqs"] });
console.log(formatText(report));
```

`runFuzzer` also accepts `scannerModules` to fuzz scanners that aren't part of
`@infrascan/aws`, such as one under development.

## Layout

| File             | Purpose                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `random.ts`      | Seeded Park–Miller PRNG and per-iteration seed derivation                 |
| `profile.ts`     | Per-iteration knobs for response shape                                    |
| `values.ts`      | Realistic scalar values, IAM policies, special cases, shared id pools     |
| `generator.ts`   | Builds responses from Smithy schemas                                      |
| `transport.ts`   | Answers calls for an iteration: error injection, call budget              |
| `interceptor.ts` | Routes AWS SDK clients' `send` to the transport, and restores it          |
| `instrument.ts`  | Wraps scanner extension points to record and contain failures             |
| `connector.ts`   | In-memory, JSON round-tripping connector                                  |
| `console.ts`     | Captures SDK warnings as findings                                         |
| `findings.ts`    | Groups and normalizes findings                                            |
| `fuzzer.ts`      | The run loop                                                              |
| `report.ts`      | Text and JSON reports                                                     |
| `cli.ts`         | `infrascan-fuzz` command line                                             |
