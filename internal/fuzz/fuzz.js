/* eslint-disable */
// Schema-driven fuzzer for the Infrascan AWS scanners.
//
// Every AWS SDK client's `send` is replaced with a generator that builds a
// response from the operation's Smithy output schema. Optional members are
// randomly dropped, lists/maps are randomly sized (including empty), and calls
// occasionally fail with a service exception. The full graph pipeline is then
// driven the same way `Infrascan.generateGraph` does it, but every stage is
// isolated so a single crash doesn't hide the rest.
//
// Usage: node --enable-source-maps internal/fuzz/fuzz.js [iterations] [seed]
const { createRequire } = require("module");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const ITERATIONS = Number(process.argv[2] ?? 300);
let seed = Number(process.argv[3] ?? 1);

function rand() {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (max) => Math.floor(rand() * max);

const SCANNERS = [
  "api-gateway",
  "autoscaling",
  "cloudfront",
  "cloudwatch-logs",
  "dynamodb",
  "ec2",
  "ecs",
  "elastic-load-balancing",
  "eventbridge",
  "kinesis",
  "lambda",
  "rds",
  "route53",
  "s3",
  "sns",
  "sqs",
  "step-function",
];

const sdkRequire = createRequire(path.join(ROOT, "packages/sdk/package.json"));
const { NormalizedSchema } = sdkRequire(
  createRequire(sdkRequire.resolve("@aws-sdk/client-iam")).resolve(
    "@smithy/core/schema",
  ),
);
const { IAM } = sdkRequire("@aws-sdk/client-iam");
const { scanIamRole, IAMStorage, hydrateRoleStorage } = sdkRequire(
  path.join(ROOT, "packages/sdk/dist/aws/helpers/iam.js"),
);
const sdkGraph = sdkRequire(path.join(ROOT, "packages/sdk/dist/graph.js"));
const { Graph, generateNodesFromEntity } = sdkRequire("@infrascan/core");
const cytoscape = require(path.join(
  ROOT,
  "packages/cytoscape-serializer/dist/index.js",
));
const informational = require(path.join(
  ROOT,
  "packages/informational-serializer/dist/index.js",
));

const scanners = SCANNERS.map((dir) => {
  const mod = require(path.join(ROOT, "aws-scanners", dir, "dist/index.js"));
  return mod.default ?? mod;
});

// ---------------------------------------------------------------------------
// Value generation
// ---------------------------------------------------------------------------
const ACCOUNT = "000000000000";
const REGION = "us-east-1";
const SERVICES = [
  "lambda",
  "sqs",
  "sns",
  "s3",
  "dynamodb",
  "kinesis",
  "states",
  "ecs",
  "elasticloadbalancing",
  "rds",
  "iam",
  "logs",
  "events",
  "ec2",
];

let profile; // per-iteration knobs

function token() {
  return Math.random().toString(36).slice(2, 8) + randInt(1000);
}

// IAM permits a number of shapes that are easy to forget about.
function genPolicyDocument() {
  const resource = () =>
    pick([
      "*",
      `arn:aws:sqs:${REGION}:${ACCOUNT}:q-${token()}`,
      `arn:aws:s3:::bucket-${token()}/*`,
      `arn:aws:lambda:${REGION}:${ACCOUNT}:function:*`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/t/index/*`,
    ]);
  const statement = () => {
    const stmt = { Effect: pick(["Allow", "Deny"]) };
    stmt[pick(["Action", "NotAction"])] = pick(["*", ["s3:GetObject", "sqs:*"]]);
    const v = rand();
    if (v < 0.5) stmt.Resource = resource();
    else if (v < 0.75) stmt.Resource = [resource(), resource()];
    else if (v < 0.9) stmt.NotResource = resource();
    else stmt.Principal = { Service: "lambda.amazonaws.com" }; // trust policy shape
    if (rand() < 0.2) stmt.Condition = { StringEquals: { "aws:x": "y" } };
    return stmt;
  };
  const doc = { Version: "2012-10-17" };
  doc.Statement =
    rand() < 0.25
      ? statement() // a single statement object is valid IAM
      : Array.from({ length: 1 + randInt(3) }, statement);
  const json = JSON.stringify(doc);
  // IAM returns URL-encoded documents
  return rand() < 0.5 ? encodeURIComponent(json) : json;
}

// Values the real APIs return that a naive generator won't.
const SPECIAL_VALUES = {
  SubscriptionArn: () =>
    rand() < 0.3 ? pick(["PendingConfirmation", "Deleted"]) : undefined,
  RedrivePolicy: () =>
    JSON.stringify({
      deadLetterTargetArn: `arn:aws:sqs:${REGION}:${ACCOUNT}:dlq`,
      maxReceiveCount: 3,
    }),
  EventPattern: () =>
    pick([
      JSON.stringify({ source: ["aws.ec2"] }),
      JSON.stringify({ source: "aws.s3" }),
      JSON.stringify({ "detail-type": ["x"] }),
    ]),
  definition: () =>
    JSON.stringify({
      StartAt: "A",
      States: {
        A: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: pick(["fn", `arn:aws:lambda:${REGION}:${ACCOUNT}:function:fn:alias`]) },
          Next: "B",
        },
        B: { Type: "Parallel", Branches: [{ StartAt: "C", States: { C: { Type: "Pass", End: true } } }], End: true },
      },
    }),
  DomainName: () =>
    pick([
      `bucket-${token()}.s3.amazonaws.com`,
      `bucket-${token()}.s3.${REGION}.amazonaws.com`,
      `bucket-${token()}.s3-website-${REGION}.amazonaws.com`,
      `${token()}.example.com`,
      `${token()}.elb.amazonaws.com`,
    ]),
  Endpoint: () =>
    pick([
      `https://${token()}.example.com/hook`,
      "user@example.com",
      "+15555550100",
      `arn:aws:sqs:${REGION}:${ACCOUNT}:q`,
      `arn:aws:lambda:${REGION}:${ACCOUNT}:function:fn`,
    ]),
  Protocol: () => pick(["https", "http", "email", "sms", "sqs", "lambda", "firehose", "application"]),
  VPCZoneIdentifier: () => pick(["", `subnet-a`, `subnet-a,subnet-b`, `subnet-a, subnet-b`]),
  Name: () => (rand() < 0.2 ? `${token()}.example.com.` : undefined),
  DNSName: () => `${token()}.${pick(["elb", "cloudfront", "execute-api"])}.amazonaws.com.`,
};

const pools = {};
function pooled(key, make) {
  const pool = (pools[key] = pools[key] ?? []);
  if (pool.length < 3 || rand() < 0.1) pool.push(make());
  return pick(pool);
}

function genString(name) {
  const n = name ?? "";
  if (profile.pooled && /(arn|id|name|identifier|url|definition|cluster|role)$/i.test(n) && !SPECIAL_VALUES[n]) {
    const key = /arn$/i.test(n) || n === "Role" || /definition$/i.test(n) || n === "cluster"
      ? "__arn"
      : n.toLowerCase().replace(/^(db|target|source|parent|associated)/, "");
    return pooled(key, () => genStringRaw(n));
  }
  return genStringRaw(n);
}

function genStringRaw(name) {
  const n = name ?? "";
  if (SPECIAL_VALUES[n]) {
    const v = SPECIAL_VALUES[n]();
    if (v !== undefined) return v;
  }
  if (rand() < profile.emptyString) return "";
  if (/arn$/i.test(n) || /Arns?$/.test(n) || n === "Role") {
    const svc = pick(SERVICES);
    const acct = rand() < 0.2 ? "111111111111" : ACCOUNT;
    return pick([
      `arn:aws:${svc}:${REGION}:${acct}:${token()}`,
      `arn:aws:${svc}:${REGION}:${acct}:${token()}/${token()}`,
      `arn:aws:${svc}:${REGION}:${acct}:${token()}:${token()}`,
      `arn:aws:${svc}:::${token()}`,
      `arn:aws:iam::${acct}:role/${token()}`,
    ]);
  }
  if (/policy|document/i.test(n)) return genPolicyDocument();
  if (/url|uri|endpoint/i.test(n)) return `https://${token()}.example.com/${token()}`;
  if (/date|time/i.test(n) && rand() < 0.5) return new Date().toISOString();
  if (/^vpcid$/i.test(n)) return `vpc-${token()}`;
  if (/^subnetid$/i.test(n)) return `subnet-${token()}`;
  if (/^(group)?id$/i.test(n) && rand() < 0.3) return `sg-${token()}`;
  return `${n || "s"}-${token()}`;
}

const PAGINATION = /^(Next|nextToken|NextToken|Marker|NextMarker|NextPageMarker|ContinuationToken|NextContinuationToken|IsTruncated|NextRecordName|NextRecordType|NextRecordIdentifier|LastEvaluatedTableName|ExclusiveStartTableName|NextKeyMarker|NextUploadIdMarker|position)$/;

function generate(schema, name, depth) {
  const ns = NormalizedSchema.of(schema);
  if (ns.isUnitSchema && ns.isUnitSchema()) return undefined;
  if (ns.isStructSchema()) {
    if (depth > 7) return {};
    const out = {};
    for (const [member, memberSchema] of ns.structIterator()) {
      if (depth === 0 && PAGINATION.test(member)) continue;
      const traits = memberSchema.getMergedTraits() ?? {};
      if (traits.httpHeader || traits.httpResponseCode) continue;
      const required = traits.required;
      if (!required && rand() > profile.presence) continue;
      out[member] = generate(memberSchema, member, depth + 1);
    }
    return out;
  }
  if (ns.isUnionSchema && ns.isUnionSchema()) {
    const members = [...ns.structIterator()];
    if (members.length === 0) return {};
    const [member, memberSchema] = pick(members);
    return { [member]: generate(memberSchema, member, depth + 1) };
  }
  if (ns.isListSchema()) {
    if (depth > 7) return [];
    const len = rand() < profile.emptyList ? 0 : 1 + randInt(3);
    return Array.from({ length: len }, () =>
      generate(ns.getValueSchema(), name?.replace(/s$/, ""), depth + 1),
    );
  }
  if (ns.isMapSchema()) {
    const len = rand() < profile.emptyList ? 0 : 1 + randInt(3);
    const out = {};
    for (let i = 0; i < len; i += 1) {
      out[genString("key")] = generate(ns.getValueSchema(), name, depth + 1);
    }
    return out;
  }
  if (ns.isBooleanSchema()) return rand() < 0.5;
  if (ns.isNumericSchema()) return randInt(2000);
  if (ns.isBigIntegerSchema && ns.isBigIntegerSchema()) return BigInt(randInt(100));
  if (ns.isBigDecimalSchema && ns.isBigDecimalSchema()) return randInt(100);
  if (ns.isTimestampSchema()) return new Date(Date.now() - randInt(1e9));
  if (ns.isBlobSchema()) return new Uint8Array([1, 2, 3]);
  if (ns.isDocumentSchema()) return {};
  if (ns.isStringSchema()) return genString(name);
  return undefined;
}

class FuzzServiceError extends Error {
  constructor(name) {
    super(`fuzzed ${name}`);
    this.name = name;
    this.$fault = "client";
    this.$metadata = { httpStatusCode: 403 };
  }
}

let callBudget;
function stubSend(client, ServiceException) {
  client.send = async (command) => {
    callBudget -= 1;
    if (callBudget < 0) {
      throw new Error("FUZZ: call budget exhausted (possible infinite paging)");
    }
    if (rand() < profile.errorRate) {
      // Prefer the client's own exception type so generated handlers treat it
      // like a real service error.
      const err = ServiceException
        ? new ServiceException({
            name: "AccessDeniedException",
            $fault: "client",
            $metadata: {},
            message: "fuzzed access denied",
          })
        : new FuzzServiceError("AccessDeniedException");
      throw err;
    }
    const op = command.schema;
    const output = typeof op[5] === "function" ? op[5]() : op[5];
    const result = generate(output, undefined, 0) ?? {};
    result.$metadata = { httpStatusCode: 200 };
    return result;
  };
  return client;
}

function findServiceException(client) {
  // Each client package exports `<X>ServiceException`; locate it from the
  // package that defined the client.
  try {
    const ctor = client.constructor;
    const pkgPath = Object.keys(require.cache).find(
      (k) => require.cache[k].exports?.[ctor.name] === ctor,
    );
    if (!pkgPath) return undefined;
    const exp = require.cache[pkgPath].exports;
    const key = Object.keys(exp).find((k) => /ServiceException$/.test(k));
    return key ? exp[key] : undefined;
  } catch {
    return undefined;
  }
}

// In-memory connector with JSON round-tripping, matching the fs/s3 connectors
// (Dates become strings, blobs become objects, undefined members disappear).
function memoryConnector() {
  const store = {};
  return {
    async onServiceScanCompleteCallback(account, region, service, fn, state) {
      store[`${account}|${region}|${service}|${fn}`] = JSON.stringify(state);
    },
    async resolveStateForServiceFunction(account, region, service, fn) {
      const raw = store[`${account}|${region}|${service}|${fn}`];
      return raw ? JSON.parse(raw) : [];
    },
    async getGlobalStateForServiceFunction(service, fn) {
      return Object.entries(store)
        .filter(([k]) => k.endsWith(`|${service}|${fn}`))
        .flatMap(([, v]) => JSON.parse(v));
    },
  };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------
const findings = new Map();
function frameOf(err) {
  const lines = String(err?.stack ?? "").split("\n").slice(1);
  const frame =
    lines.find(
      (l) =>
        /infrascan\/(aws-scanners|packages)\//.test(l) &&
        !/node_modules/.test(l) &&
        !/internal\/fuzz/.test(l),
    ) ?? lines[0] ?? "";
  return frame.trim().replace(/^at /, "").replace(ROOT + "/", "");
}
function record(stage, scanner, err, sample) {
  const msg = String(err?.message ?? err).split("\n")[0];
  const frame = frameOf(err);
  const key = `${stage}|${frame}|${msg.replace(/'[^']*'/g, "'_'")}`;
  const entry = findings.get(key);
  if (entry) {
    entry.count += 1;
    return;
  }
  findings.set(key, {
    stage,
    scanner,
    message: msg,
    frame,
    count: 1,
    seed: profile.seed,
    sample,
  });
}

function validateNode(node, scanner) {
  const g = node?.$graph;
  const problems = [];
  if (g == null) problems.push("missing $graph");
  else {
    if (typeof g.id !== "string" || g.id === "")
      problems.push(`$graph.id is ${JSON.stringify(g.id)}`);
    if (g.label != null && typeof g.label !== "string")
      problems.push(`$graph.label is ${typeof g.label}`);
    if (g.parent != null && typeof g.parent !== "string")
      problems.push(`$graph.parent is ${typeof g.parent}`);
  }
  if (node?.resource && typeof node.resource.id !== "string")
    problems.push(`resource.id is ${JSON.stringify(node.resource.id)}`);
  for (const p of problems) {
    record("invalid-node", scanner, new Error(`${node?.$graph?.nodeType}: ${p}`));
  }
}

// ---------------------------------------------------------------------------
// One iteration of the full pipeline
// ---------------------------------------------------------------------------
const credentials = async () => ({ accessKeyId: "AKIA", secretAccessKey: "x" });

const fatalEntities = new Set();
const BASE_SEED = seed;
async function iteration(i) {
  seed = BASE_SEED * 100003 + i;
  profile = {
    seed: `${BASE_SEED}:${i}`,
    presence: pick([0, 0.15, 0.4, 0.7, 0.9, 1]),
    emptyList: pick([0, 0.2, 0.5]),
    emptyString: pick([0, 0, 0.05]),
    errorRate: pick([0, 0, 0.1, 0.4]),
    pooled: rand() < 0.5,
  };
  for (const k of Object.keys(pools)) delete pools[k];
  callBudget = 4000;
  const connector = memoryConnector();
  const context = { account: ACCOUNT, region: REGION, partition: "aws" };
  const iamStorage = new IAMStorage();
  const iamClient = stubSend(
    new IAM({ region: REGION, credentials }),
    undefined,
  );

  // Scan phase
  for (const scanner of scanners) {
    let client;
    try {
      client = scanner.getClient(credentials, context);
      stubSend(client, findServiceException(client));
    } catch (err) {
      record("getClient", scanner.key, err);
      continue;
    }
    for (const getter of scanner.getters) {
      try {
        await getter(client, connector, context);
      } catch (err) {
        record(`getter:${getter.name}`, scanner.key, err);
      }
    }
    if (scanner.getIamRoles) {
      let roles = [];
      try {
        roles = await scanner.getIamRoles(connector);
      } catch (err) {
        record("getIamRoles", scanner.key, err);
      }
      for (const { roleArn } of roles) {
        try {
          await scanIamRole(iamStorage, iamClient, roleArn);
        } catch (err) {
          // The SDK catches these and logs, so they are not fatal, but they
          // still lose data.
          if (!/fuzzed/.test(String(err?.message)))
            record("scanIamRole(caught)", scanner.key, err, roleArn);
        }
      }
    }
  }
  await connector.onServiceScanCompleteCallback(
    "global",
    "global",
    "IAM",
    "roles",
    iamStorage.getAllRoles(),
  );

  // Graph phase - mirrors Infrascan.generateGraph
  const graph = Graph();
  const serviceNodeMap = {};
  const warn = console.warn;
  const dropped = [];
  console.warn = (...args) => dropped.push(args.join(" "));
  sdkGraph.addNodeToGraphUnchecked(graph, sdkGraph.buildAccountNode(ACCOUNT));
  sdkGraph.addNodeToGraphUnchecked(
    graph,
    sdkGraph.buildRegionNode(ACCOUNT, REGION),
  );
  for (const scanner of scanners) {
    const label = scanner.arnLabel ?? scanner.service.toLowerCase();
    serviceNodeMap[label] = serviceNodeMap[label] ?? [];
    for (const entity of scanner.entities ?? []) {
      const entityLabel = entity.debugLabel ?? entity.nodeType;
      // Sanity check: the real SDK path. Any throw here is fatal to
      // Infrascan.generateGraph since nothing catches it.
      try {
        for await (const _ of generateNodesFromEntity(connector, context, entity));
      } catch (err) {
        fatalEntities.add(entityLabel);
      }
      // Isolated path: evaluate every component separately so one failure
      // doesn't mask another.
      let values = [];
      try {
        const state = await entity.getState(connector, context);
        values = state.flatMap((s) => entity.translate(s));
      } catch (err) {
        record(`entity:${entityLabel}:translate`, scanner.key, err);
        continue;
      }
      for (const value of values) {
        const node = {};
        let ok = true;
        for (const [label2, factory] of Object.entries(entity.components)) {
          try {
            node[label2] = factory(value);
          } catch (err) {
            ok = false;
            record(`entity:${entityLabel}.${label2}`, scanner.key, err);
          }
        }
        if (!ok) continue;
        validateNode(node, scanner.key);
        try {
          graph.addNode(node);
        } catch (err) {
          if (!/already exists|conflict/i.test(err.message)) {
            const parent = node.$graph?.parent;
            if (process.env.TRACE) process.stderr.write(`DROP ${JSON.stringify(node.$graph)} ${err.message}\n`);
            const parentKind =
              parent == null ? "null" : parent === "" ? "empty" : "unresolved";
            record(
              "node-dropped",
              scanner.key,
              new Error(`${node.$graph?.nodeType}: ${err.message.replace(node.$graph?.parent ?? "\u0000", "<parent>").replace(node.$graph?.id ?? "\u0000", "<id>")} (parent ${parentKind})`),
            );
          }
        }
        serviceNodeMap[label].push(node.$graph?.id);
      }
    }
  }
  for (const scanner of scanners) {
    if (!scanner.getEdges) continue;
    try {
      const edges = await scanner.getEdges(connector);
      for (const edge of edges) {
        if (typeof edge.source !== "string" || typeof edge.target !== "string")
          record(
            "invalid-edge",
            scanner.key,
            new Error(`edge endpoint ${typeof edge.source}->${typeof edge.target}`),
          );
        sdkGraph.addEdgeToGraphUnchecked(graph, edge);
      }
    } catch (err) {
      record("getEdges", scanner.key, err);
    }
  }
  hydrateRoleStorage(
    iamStorage,
    await connector.getGlobalStateForServiceFunction("IAM", "roles"),
  );
  for (const scanner of scanners) {
    if (!scanner.getIamRoles) continue;
    try {
      const roles = await scanner.getIamRoles(connector);
      for (const { roleArn, executor } of roles) {
        try {
          const edges = await sdkGraph.generateEdgesForRole(
            iamStorage,
            roleArn,
            executor,
            serviceNodeMap,
          );
          edges.forEach((e) => sdkGraph.addEdgeToGraphUnchecked(graph, e));
        } catch (err) {
          record("generateEdgesForRole", scanner.key, err);
        }
      }
    } catch (err) {
      record("getIamRoles(graph)", scanner.key, err);
    }
  }
  console.warn = warn;

  for (const [name, ser] of [
    ["cytoscape", cytoscape],
    ["informational", informational],
  ]) {
    try {
      JSON.stringify(ser.serializeGraph(graph), (k, v) =>
        typeof v === "bigint" ? Number(v) : v,
      );
    } catch (err) {
      record(`serializer:${name}`, "-", err);
    }
  }
}

(async () => {
  const log = console.log;
  const error = console.error;
  console.log = () => {};
  console.error = () => {};
  const only = process.argv[4] != null ? Number(process.argv[4]) : undefined;
  for (let i = only ?? 0; i < (only != null ? only + 1 : ITERATIONS); i += 1) {
    try {
      await iteration(i);
    } catch (err) {
      record("harness", "-", err);
    }
  }
  console.log = log;
  console.error = error;
  const rows = [...findings.values()].sort((a, b) =>
    a.stage.localeCompare(b.stage),
  );
  if (process.env.JSON) {
    log(JSON.stringify(rows, null, 2));
  } else {
    for (const f of rows) {
      log(`[${f.stage}] (${f.scanner}) x${f.count} seed=${f.seed}\n    ${f.message}\n    at ${f.frame}`);
    }
    log(`\nEntities that would abort generateGraph: ${[...fatalEntities].join(", ")}`);
    log(`\n${rows.length} distinct findings over ${ITERATIONS} iterations`);
  }
})();
