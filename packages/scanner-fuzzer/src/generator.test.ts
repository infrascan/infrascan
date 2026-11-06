import t from "tap";
import {
  GetFunctionCommand,
  ListFunctionsCommand,
} from "@aws-sdk/client-lambda";
import { ResponseGenerator, describeOperation } from "./generator";
import type { FuzzProfile } from "./profile";
import { Random } from "./random";
import { ValueFactory } from "./values";

const context = {
  account: "000000000000",
  region: "us-east-1",
  partition: "aws",
};
const generatorFor = (overrides: Partial<FuzzProfile> = {}, seed = 1) =>
  new ResponseGenerator(
    new ValueFactory(
      new Random(seed),
      {
        presence: 1,
        emptyCollection: 0,
        emptyString: 0,
        errorRate: 0,
        pooledIdentifiers: false,
        ...overrides,
      },
      context,
    ),
  );

t.test(
  "operations are described from the command's schema",
  async ({ equal, throws }) => {
    equal(
      describeOperation(new GetFunctionCommand({ FunctionName: "f" })).name,
      "GetFunction",
    );
    throws(() => describeOperation({}), TypeError);
  },
);

t.test(
  "full presence fills in optional members, typed by schema",
  async ({ equal, ok, type }) => {
    const { operation, response } = generatorFor().respond(
      new GetFunctionCommand({ FunctionName: "f" }),
    );
    equal(operation, "GetFunction");
    const configuration = response.Configuration as Record<string, unknown>;
    ok(configuration);
    type(configuration.FunctionName, "string");
    type(configuration.MemorySize, "number");
    ok(Array.isArray(configuration.Layers));
    ok(String(configuration.FunctionArn).startsWith("arn:aws:"));
  },
);

t.test("zero presence omits every optional member", async ({ same }) => {
  const { response } = generatorFor({ presence: 0 }).respond(
    new GetFunctionCommand({ FunctionName: "f" }),
  );
  same(response, {});
});

t.test(
  "pagination tokens are never generated, so paging terminates",
  async ({ equal }) => {
    for (let seed = 1; seed < 20; seed += 1) {
      const { response } = generatorFor({}, seed).respond(
        new ListFunctionsCommand({}),
      );
      equal(response.NextMarker, undefined);
    }
  },
);

t.test("collections follow the profile", async ({ equal, ok }) => {
  const empty = generatorFor({ emptyCollection: 1 }).respond(
    new ListFunctionsCommand({}),
  );
  equal((empty.response.Functions as unknown[]).length, 0);
  const full = generatorFor({ emptyCollection: 0 }).respond(
    new ListFunctionsCommand({}),
  );
  ok((full.response.Functions as unknown[]).length > 0);
});

t.test("the same seed produces the same response", async ({ same }) => {
  const command = new GetFunctionCommand({ FunctionName: "f" });
  same(
    generatorFor({ presence: 0.5 }, 11).respond(command),
    generatorFor({ presence: 0.5 }, 11).respond(command),
  );
});

t.test(
  "bootstrap operations the SDK depends on are coherent",
  async ({ equal, same }) => {
    const generator = generatorFor();
    const identity = generator.respond({
      schema: [
        9,
        "com.amazonaws.sts",
        "GetCallerIdentity",
        0,
        () => [3, "ns", "In", 0, [], []],
        () => [3, "ns", "Out", 0, [], []],
      ],
    });
    equal(identity.response.Account, context.account);
    const regions = generator.respond({
      schema: [
        9,
        "com.amazonaws.ec2",
        "DescribeRegions",
        0,
        () => [3, "ns", "In", 0, [], []],
        () => [3, "ns", "Out", 0, [], []],
      ],
    });
    same(regions.response.Regions, [{ RegionName: context.region }]);
  },
);
