import t from "tap";
import { formatApiArn } from "./targets";

t.test("formatApiArn", async (t) => {
  t.equal(
    formatApiArn("eu-west-1", "abc123"),
    "arn:aws:apigateway:eu-west-1::/apis/abc123",
  );
  t.equal(
    formatApiArn("cn-north-1", "abc123", "aws-cn"),
    "arn:aws-cn:apigateway:cn-north-1::/apis/abc123",
  );
});
