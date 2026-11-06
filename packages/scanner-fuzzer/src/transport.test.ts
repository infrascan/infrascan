import t from "tap";
import { LambdaClient, GetFunctionCommand } from "@aws-sdk/client-lambda";
import { ResponseGenerator } from "./generator";
import { Random } from "./random";
import { CallBudgetExceededError } from "./errors";
import { TransportInterceptor, findSendPrototype } from "./interceptor";
import { FuzzTransport } from "./transport";
import { ValueFactory } from "./values";

const context = {
  account: "000000000000",
  region: "us-east-1",
  partition: "aws",
};
const credentials = async () => ({ accessKeyId: "a", secretAccessKey: "b" });

function transport(errorRate = 0, budget?: number) {
  const random = new Random(1);
  const generator = new ResponseGenerator(
    new ValueFactory(
      random,
      {
        presence: 1,
        emptyCollection: 0,
        emptyString: 0,
        errorRate,
        pooledIdentifiers: false,
      },
      context,
    ),
  );
  return new FuzzTransport(generator, random, errorRate, budget);
}

t.test(
  "the send prototype is found on the client's base class",
  async ({ ok, throws }) => {
    const client = new LambdaClient({ region: "us-east-1", credentials });
    const proto = findSendPrototype(client);
    ok(Object.prototype.hasOwnProperty.call(proto, "send"));
    throws(() => findSendPrototype({}), TypeError);
  },
);

t.test(
  "intercepted clients are answered by the transport, then restored",
  async ({ equal, ok, rejects }) => {
    const client = new LambdaClient({ region: "us-east-1", credentials });
    const proto = findSendPrototype(client);
    const original = proto.send;
    const interceptor = new TransportInterceptor();
    interceptor.install([
      client,
      new LambdaClient({ region: "eu-west-1", credentials }),
    ]);
    equal(interceptor.installed, 1, "clients sharing a base are patched once");

    // No active iteration: requests are refused rather than sent to AWS
    await rejects(
      client.send(new GetFunctionCommand({ FunctionName: "f" })),
      /no iteration is active/,
    );

    const active = transport();
    interceptor.use(active);
    const response = await client.send(
      new GetFunctionCommand({ FunctionName: "f" }),
    );
    ok(response.Configuration);
    equal(active.calls.get("GetFunction"), 1);

    interceptor.restore();
    equal(proto.send, original);
  },
);

t.test("callback style sends are supported", async ({ ok }) => {
  const client = new LambdaClient({ region: "us-east-1", credentials });
  const interceptor = new TransportInterceptor();
  interceptor.install([client]);
  interceptor.use(transport());
  try {
    const data = await new Promise((resolve, reject) => {
      client.send(
        new GetFunctionCommand({ FunctionName: "f" }),
        (err: unknown, result: unknown) =>
          err ? reject(err) : resolve(result),
      );
    });
    ok(data);
  } finally {
    interceptor.restore();
  }
});

t.test("errors are injected at the profile's rate", async ({ rejects }) => {
  await rejects(
    transport(1).send(new GetFunctionCommand({ FunctionName: "f" })),
    { name: "AccessDeniedException", $injected: true },
  );
});

t.test("bootstrap operations never fail", async ({ resolves }) => {
  const always = transport(1);
  await resolves(
    always.send({
      schema: [
        9,
        "com.amazonaws.sts",
        "GetCallerIdentity",
        0,
        () => [3, "ns", "In", 0, [], []],
        () => [3, "ns", "Out", 0, [], []],
      ],
    }),
  );
});

t.test("the call budget catches runaway pagination", async ({ rejects }) => {
  const limited = transport(0, 2);
  const command = new GetFunctionCommand({ FunctionName: "f" });
  await limited.send(command);
  await limited.send(command);
  await rejects(limited.send(command), CallBudgetExceededError);
});
