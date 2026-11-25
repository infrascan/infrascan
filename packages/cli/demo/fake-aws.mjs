// A stand-in for the AWS APIs, used to record the quickstart demo without a real account.
// Each access key in ./home/.aws/credentials maps to its own account, and every account has a small
// "orders" app in each region. Anything not modelled here gets an empty, well-formed response.
import http from "node:http";

const PORT = Number(process.env.FAKE_AWS_PORT ?? 4599);
const LATENCY_MS = [25, 90];
const ENABLED_REGIONS = [
  "ap-southeast-2",
  "eu-central-1",
  "eu-west-1",
  "us-east-1",
  "us-west-2",
];
const ACCOUNTS_BY_KEY = {
  "DEMO-DEFAULT": "555555555555",
  "DEMO-PRODUCTION": "123456789012",
  "DEMO-STAGING": "210987654321",
};
const SNS_NS = ' xmlns="http://sns.amazonaws.com/doc/2010-03-31/"';
const JSON_10 = "application/x-amz-json-1.0";

function queryXml(action, inner = "", ns = "") {
  return `<?xml version="1.0"?><${action}Response${ns}><${action}Result>${inner}</${action}Result><ResponseMetadata><RequestId>1</RequestId></ResponseMetadata></${action}Response>`;
}

function json(body, contentType = "application/json") {
  return { contentType, body: JSON.stringify(body) };
}

function xml(body, contentType = "text/xml", status = 200) {
  return { contentType, body, status };
}

function app(account, region) {
  const functions = ["orders-api", "process-order", "notify-customer"].map(
    (name) => ({
      FunctionName: name,
      FunctionArn: `arn:aws:lambda:${region}:${account}:function:${name}`,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      MemorySize: 512,
      Timeout: 30,
      Role: `arn:aws:iam::${account}:role/${name}-role`,
      State: "Active",
      PackageType: "Zip",
      Architectures: ["arm64"],
    }),
  );
  return {
    functions,
    queueUrl: `http://127.0.0.1:${PORT}/${account}/orders-queue-${region}`,
    queueArn: `arn:aws:sqs:${region}:${account}:orders-queue`,
    topicArn: `arn:aws:sns:${region}:${account}:order-events`,
    tableArn: `arn:aws:dynamodb:${region}:${account}:table/orders`,
  };
}

function lambda(path, query, account, region) {
  const { functions, queueArn } = app(account, region);
  if (/^\/2015-03-31\/functions\/?$/.test(path)) {
    return json({ Functions: functions });
  }
  const getFunction = path.match(/^\/2015-03-31\/functions\/([^/]+)$/);
  if (getFunction) {
    const fn = functions.find(
      (f) =>
        f.FunctionName === getFunction[1] || f.FunctionArn === getFunction[1],
    );
    return json({ Configuration: fn, Code: { RepositoryType: "S3" } });
  }
  if (path.startsWith("/2015-03-31/event-source-mappings")) {
    const isConsumer = (query.get("FunctionName") ?? "").includes(
      "process-order",
    );
    const mapping = {
      UUID: "esm-1",
      EventSourceArn: queueArn,
      FunctionArn: functions[1].FunctionArn,
      State: "Enabled",
      BatchSize: 10,
    };
    return json({ EventSourceMappings: isConsumer ? [mapping] : [] });
  }
  return json({});
}

function jsonProtocol(target, account, region) {
  const { queueUrl, queueArn, tableArn } = app(account, region);
  switch (target) {
    case "AmazonSQS.ListQueues":
      return json({ QueueUrls: [queueUrl] }, JSON_10);
    case "AmazonSQS.GetQueueAttributes":
      return json(
        {
          Attributes: {
            QueueArn: queueArn,
            VisibilityTimeout: "30",
            ApproximateNumberOfMessages: "12",
          },
        },
        JSON_10,
      );
    case "AmazonSQS.ListQueueTags":
      return json({ Tags: { team: "orders" } }, JSON_10);
    case "DynamoDB_20120810.ListTables":
      return json({ TableNames: ["orders"] }, JSON_10);
    case "DynamoDB_20120810.DescribeTable":
      return json(
        {
          Table: {
            TableName: "orders",
            TableArn: tableArn,
            TableStatus: "ACTIVE",
            ItemCount: 48211,
            KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
          },
        },
        JSON_10,
      );
    default:
      return json({}, "application/x-amz-json-1.1");
  }
}

function queryProtocol(action, params, account, region) {
  const { queueArn, topicArn, functions } = app(account, region);
  switch (action) {
    case "GetCallerIdentity":
      return xml(
        queryXml(
          action,
          `<Arn>arn:aws:sts::${account}:assumed-role/PlatformReadOnly/demo-user</Arn><UserId>AROAEXAMPLE:demo-user</UserId><Account>${account}</Account>`,
        ),
      );
    case "DescribeRegions": {
      const regions =
        params.get("AllRegions") === "true"
          ? [...ENABLED_REGIONS, "af-south-1", "me-central-1"]
          : ENABLED_REGIONS;
      const items = regions
        .map(
          (r) =>
            `<item><regionName>${r}</regionName><optInStatus>opt-in-not-required</optInStatus></item>`,
        )
        .join("");
      return xml(
        `<DescribeRegionsResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/"><requestId>1</requestId><regionInfo>${items}</regionInfo></DescribeRegionsResponse>`,
      );
    }
    case "ListTopics":
      return xml(
        queryXml(
          action,
          `<Topics><member><TopicArn>${topicArn}</TopicArn></member></Topics>`,
          SNS_NS,
        ),
      );
    case "GetTopicAttributes":
      return xml(
        queryXml(
          action,
          `<Attributes><entry><key>TopicArn</key><value>${topicArn}</value></entry></Attributes>`,
          SNS_NS,
        ),
      );
    case "ListSubscriptionsByTopic": {
      const subscription = (protocol, endpoint, id) =>
        `<member><TopicArn>${topicArn}</TopicArn><Protocol>${protocol}</Protocol><SubscriptionArn>${topicArn}:${id}</SubscriptionArn><Owner>${account}</Owner><Endpoint>${endpoint}</Endpoint></member>`;
      return xml(
        queryXml(
          action,
          `<Subscriptions>${subscription("sqs", queueArn, "s1")}${subscription(
            "lambda",
            functions[2].FunctionArn,
            "s2",
          )}</Subscriptions>`,
          SNS_NS,
        ),
      );
    }
    case "ListTagsForResource":
      return xml(queryXml(action, "<Tags/>", SNS_NS));
    default:
      return xml(queryXml(action));
  }
}

function s3(req, path, account) {
  const { topicArn } = app(account, "us-east-1");
  if (path === "/" && req.method === "GET") {
    return xml(
      `<ListAllMyBucketsResult><Buckets><Bucket><Name>acme-uploads-${account}</Name><CreationDate>2025-03-01T00:00:00.000Z</CreationDate><BucketRegion>us-east-1</BucketRegion></Bucket></Buckets><Owner><ID>abc</ID></Owner></ListAllMyBucketsResult>`,
      "application/xml",
    );
  }
  if (req.url.includes("notification")) {
    return xml(
      `<NotificationConfiguration><TopicConfiguration><Id>uploads</Id><Topic>${topicArn}</Topic><Event>s3:ObjectCreated:*</Event></TopicConfiguration></NotificationConfiguration>`,
      "application/xml",
    );
  }
  if (req.url.includes("tagging")) {
    return xml(
      "<Tagging><TagSet><Tag><Key>team</Key><Value>orders</Value></Tag></TagSet></Tagging>",
      "application/xml",
    );
  }
  return xml(
    "<Error><Code>NoSuchWebsiteConfiguration</Code><Message>none</Message></Error>",
    "application/xml",
    404,
  );
}

function route(req, body) {
  const authorization = req.headers.authorization ?? "";
  const [, accessKey, region, service] =
    authorization.match(/Credential=([^/]+)\/[^/]+\/([^/]+)\/([^/]+)\//) ?? [];
  const account = ACCOUNTS_BY_KEY[accessKey] ?? ACCOUNTS_BY_KEY["DEMO-DEFAULT"];
  const target = req.headers["x-amz-target"];
  const params = new URLSearchParams(body);
  const action = params.get("Action");
  const [rawPath, rawQuery] = req.url.split("?");
  const path = decodeURIComponent(rawPath);

  if (service === "lambda") {
    return lambda(path, new URLSearchParams(rawQuery ?? ""), account, region);
  }
  if (service === "s3") {
    return s3(req, path, account);
  }
  if (target) {
    return jsonProtocol(target, account, region);
  }
  if (action) {
    return queryProtocol(action, params, account, region);
  }
  if (service === "route53" || service === "cloudfront") {
    return xml("<Empty/>", "application/xml");
  }
  return json({});
}

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let response;
      try {
        response = route(req, body);
      } catch {
        response = { status: 500, contentType: "application/json", body: "{}" };
      }
      const [min, max] = LATENCY_MS;
      setTimeout(() => {
        res.statusCode = response.status ?? 200;
        res.setHeader("content-type", response.contentType);
        res.setHeader("x-amzn-requestid", "1");
        res.end(response.body);
      }, min + Math.random() * (max - min));
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`fake AWS listening on 127.0.0.1:${PORT}`);
  });
