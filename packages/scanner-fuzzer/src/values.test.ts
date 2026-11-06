import t from "tap";
import type { FuzzProfile } from "./profile";
import { Random } from "./random";
import { ValueFactory } from "./values";

const context = {
  account: "000000000000",
  region: "us-east-1",
  partition: "aws",
};
const profile = (overrides: Partial<FuzzProfile> = {}): FuzzProfile => ({
  presence: 1,
  emptyCollection: 0,
  emptyString: 0,
  errorRate: 0,
  pooledIdentifiers: false,
  ...overrides,
});
const factory = (overrides?: Partial<FuzzProfile>, seed = 1) =>
  new ValueFactory(new Random(seed), profile(overrides), context);

t.test("ARN members produce ARNs", async ({ match }) => {
  const values = factory();
  for (let i = 0; i < 50; i += 1) {
    match(values.string("FunctionArn"), /^arn:aws:[a-z0-9-]+:/);
  }
});

t.test("generated identifiers always contain a digit", async ({ match }) => {
  const values = factory();
  for (let i = 0; i < 200; i += 1) {
    match(values.id(), /\d/);
  }
});

t.test(
  "policy documents are valid, possibly URL encoded, IAM JSON",
  async ({ ok, type }) => {
    const values = factory();
    let sawNotResource = false;
    let sawSingleStatement = false;
    for (let i = 0; i < 200; i += 1) {
      const document = JSON.parse(decodeURIComponent(values.policyDocument()));
      ok(document.Statement);
      const statements = Array.isArray(document.Statement)
        ? document.Statement
        : [document.Statement];
      sawSingleStatement ||= !Array.isArray(document.Statement);
      for (const statement of statements) {
        type(statement.Effect, "string");
        sawNotResource ||= statement.NotResource != null;
      }
    }
    ok(sawNotResource, "covers NotResource statements");
    ok(sawSingleStatement, "covers a single statement object");
  },
);

t.test(
  "special values cover shapes the schema can't express",
  async ({ ok }) => {
    const values = factory();
    const subscriptionArns = new Set(
      Array.from({ length: 200 }, () => values.string("SubscriptionArn")),
    );
    ok(subscriptionArns.has("PendingConfirmation"));
    ok(subscriptionArns.has("Deleted"));
    ok([...subscriptionArns].some((arn) => arn.startsWith("arn:")));
  },
);

t.test("pooled identifiers repeat so references resolve", async ({ ok }) => {
  const values = factory({ pooledIdentifiers: true });
  const vpcIds = Array.from({ length: 50 }, () => values.string("VpcId"));
  ok(new Set(vpcIds).size < vpcIds.length / 2);
  // Differently prefixed members referring to the same thing share a pool
  const clusterIds = new Set(
    Array.from({ length: 30 }, () => values.string("ClusterIdentifier")),
  );
  const dbClusterIds = Array.from({ length: 30 }, () =>
    values.string("DBClusterIdentifier"),
  );
  ok(dbClusterIds.some((id) => clusterIds.has(id)));
});

t.test("unpooled identifiers rarely repeat", async ({ equal }) => {
  const values = factory();
  const vpcIds = Array.from({ length: 50 }, () => values.string("VpcId"));
  equal(new Set(vpcIds).size, vpcIds.length);
});

t.test("empty strings follow the profile", async ({ equal, ok }) => {
  const always = factory({ emptyString: 1 });
  equal(always.string("Description"), "");
  ok(factory().string("Description").length > 0);
});
