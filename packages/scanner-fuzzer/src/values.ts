import type { FuzzProfile } from "./profile";
import type { Random } from "./random";

export interface AccountContext {
  account: string;
  region: string;
  partition: string;
}

/**
 * An account other than the one being scanned, used for cross-account references.
 */
export const FOREIGN_ACCOUNT = "111111111111";

const ARN_SERVICES = [
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

/**
 * Members whose values reference other resources. In pooled mode they are drawn
 * from a small shared set so that references resolve.
 */
const IDENTIFIER_MEMBER =
  /(arn|id|name|identifier|url|definition|cluster|role)$/i;

/**
 * Members that hold an ARN of any resource type. They share one pool so an ARN
 * produced by one API can be referenced from another.
 */
const ARN_MEMBER = /(arn|definition)$/i;

type SpecialValue = (factory: ValueFactory) => string | undefined;

/**
 * Values the real APIs return that a generator working only from the schema
 * would never produce. Returning undefined falls back to generic generation.
 */
const SPECIAL_VALUES: Record<string, SpecialValue> = {
  // Unconfirmed and deleted subscriptions report a placeholder instead of an ARN
  SubscriptionArn: (f) =>
    f.random.chance(0.3)
      ? f.random.pick(["PendingConfirmation", "Deleted"])
      : undefined,
  RedrivePolicy: (f) =>
    JSON.stringify({
      deadLetterTargetArn: `arn:${f.context.partition}:sqs:${f.context.region}:${f.context.account}:dlq`,
      maxReceiveCount: 3,
    }),
  EventPattern: (f) =>
    f.random.pick([
      JSON.stringify({ source: ["aws.ec2"] }),
      JSON.stringify({ source: "aws.s3" }),
      JSON.stringify({ "detail-type": ["Scheduled Event"] }),
      "not json",
    ]),
  // Step Function definitions
  definition: (f) =>
    JSON.stringify({
      StartAt: "Invoke",
      States: {
        Invoke: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: {
            FunctionName: f.random.pick([
              "function-name",
              `arn:${f.context.partition}:lambda:${f.context.region}:${f.context.account}:function:fn:alias`,
            ]),
          },
          Next: "Fanout",
        },
        Fanout: {
          Type: "Parallel",
          Branches: [
            { StartAt: "Done", States: { Done: { Type: "Pass", End: true } } },
          ],
          End: true,
        },
      },
    }),
  // CloudFront origins
  DomainName: (f) => {
    const { region } = f.context;
    return f.random.pick([
      `bucket-${f.id()}.s3.amazonaws.com`,
      `bucket-${f.id()}.s3.${region}.amazonaws.com`,
      `bucket-${f.id()}.s3-website-${region}.amazonaws.com`,
      `${f.id()}.example.com`,
      `${f.id()}.elb.amazonaws.com`,
    ]);
  },
  // SNS subscription endpoints
  Endpoint: (f) =>
    f.random.pick([
      `https://${f.id()}.example.com/hook`,
      "user@example.com",
      "+15555550100",
      `arn:${f.context.partition}:sqs:${f.context.region}:${f.context.account}:queue`,
      `arn:${f.context.partition}:lambda:${f.context.region}:${f.context.account}:function:fn`,
    ]),
  Protocol: (f) =>
    f.random.pick([
      "https",
      "http",
      "email",
      "sms",
      "sqs",
      "lambda",
      "firehose",
      "application",
    ]),
  // Comma separated subnet list on Auto Scaling groups
  VPCZoneIdentifier: (f) =>
    f.random.pick(["", "subnet-a", "subnet-a,subnet-b", "subnet-a, subnet-b"]),
  // Route53 record names are fully qualified
  Name: (f) => (f.random.chance(0.2) ? `${f.id()}.example.com.` : undefined),
  DNSName: (f) =>
    `${f.id()}.${f.random.pick([
      "elb",
      "cloudfront",
      "execute-api",
    ])}.amazonaws.com.`,
};

/**
 * Produces plausible scalar values for a member, given its name.
 */
export class ValueFactory {
  readonly random: Random;

  readonly profile: FuzzProfile;

  readonly context: AccountContext;

  private readonly pools = new Map<string, string[]>();

  constructor(random: Random, profile: FuzzProfile, context: AccountContext) {
    this.random = random;
    this.profile = profile;
    this.context = context;
  }

  string(memberName?: string): string {
    const name = memberName ?? "";
    if (
      this.profile.pooledIdentifiers &&
      SPECIAL_VALUES[name] == null &&
      IDENTIFIER_MEMBER.test(name)
    ) {
      return this.pooled(ValueFactory.poolKey(name), () =>
        this.freshString(name),
      );
    }
    return this.freshString(name);
  }

  /**
   * An IAM policy document, covering the shapes IAM allows that are easy to
   * forget: `NotResource`, `NotAction`, a single statement object instead of a
   * list, resource lists, trust policies, and URL encoding.
   */
  policyDocument(): string {
    const { partition, region, account } = this.context;
    const resource = () =>
      this.random.pick([
        "*",
        `arn:${partition}:sqs:${region}:${account}:queue-${this.id()}`,
        `arn:${partition}:s3:::bucket-${this.id()}/*`,
        `arn:${partition}:lambda:${region}:${account}:function:*`,
        `arn:${partition}:dynamodb:${region}:${account}:table/table/index/*`,
      ]);
    const statement = () => {
      const stmt: Record<string, unknown> = {
        Effect: this.random.pick(["Allow", "Deny"]),
      };
      stmt[this.random.pick(["Action", "NotAction"])] = this.random.pick([
        "*",
        ["s3:GetObject", "sqs:*"],
      ]);
      const shape = this.random.next();
      if (shape < 0.5) {
        stmt.Resource = resource();
      } else if (shape < 0.75) {
        stmt.Resource = [resource(), resource()];
      } else if (shape < 0.9) {
        stmt.NotResource = resource();
      } else {
        stmt.Principal = { Service: "lambda.amazonaws.com" };
      }
      if (this.random.chance(0.2)) {
        stmt.Condition = { StringEquals: { "aws:PrincipalTag/team": "a" } };
      }
      return stmt;
    };
    const document = {
      Version: "2012-10-17",
      Statement: this.random.chance(0.25)
        ? statement()
        : Array.from({ length: 1 + this.random.int(3) }, statement),
    };
    const json = JSON.stringify(document);
    // IAM returns URL-encoded documents
    return this.random.chance(0.5) ? encodeURIComponent(json) : json;
  }

  /**
   * A generated identifier fragment. It always contains digits, like real AWS
   * identifiers, which lets findings strip run-specific data from messages.
   */
  id(): string {
    return `${this.random.token(6)}${10 + this.random.int(90)}`;
  }

  arn(): string {
    const { partition, region, account } = this.context;
    const service = this.random.pick(ARN_SERVICES);
    const owner = this.random.chance(0.2) ? FOREIGN_ACCOUNT : account;
    const id = this.id();
    return this.random.pick([
      `arn:${partition}:${service}:${region}:${owner}:${id}`,
      `arn:${partition}:${service}:${region}:${owner}:${id}/${this.id()}`,
      `arn:${partition}:${service}:${region}:${owner}:${id}:${this.id()}`,
      `arn:${partition}:${service}:::${id}`,
      `arn:${partition}:iam::${owner}:role/${id}`,
    ]);
  }

  private freshString(name: string): string {
    const special = SPECIAL_VALUES[name]?.(this);
    if (special !== undefined) {
      return special;
    }
    if (this.random.chance(this.profile.emptyString)) {
      return "";
    }
    if (/arns?$/i.test(name) || name === "Role") {
      return this.arn();
    }
    if (/policy|document/i.test(name)) {
      return this.policyDocument();
    }
    if (/url|uri|endpoint/i.test(name)) {
      return `https://${this.id()}.example.com/${this.id()}`;
    }
    if (/date|time/i.test(name) && this.random.chance(0.5)) {
      return new Date(
        Date.UTC(2025, 0, 1) + this.random.int(1e10),
      ).toISOString();
    }
    if (/^vpcid$/i.test(name)) {
      return `vpc-${this.id()}`;
    }
    if (/^subnetid$/i.test(name)) {
      return `subnet-${this.id()}`;
    }
    if (/^(group)?id$/i.test(name) && this.random.chance(0.3)) {
      return `sg-${this.id()}`;
    }
    return `${name || "value"}-${this.id()}`;
  }

  private pooled(key: string, make: () => string): string {
    let pool = this.pools.get(key);
    if (pool == null) {
      pool = [];
      this.pools.set(key, pool);
    }
    if (pool.length < 3 || this.random.chance(0.1)) {
      pool.push(make());
    }
    return this.random.pick(pool);
  }

  private static poolKey(name: string): string {
    if (ARN_MEMBER.test(name) || name === "Role" || name === "cluster") {
      return "arn";
    }
    // e.g. DBClusterIdentifier and ClusterIdentifier refer to the same thing
    return name
      .toLowerCase()
      .replace(/^(db|target|source|parent|associated)/, "");
  }
}
