import {
  GetBucketTaggingCommandOutput,
  GetBucketWebsiteCommandOutput,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import t from "tap";
import { mapNotFoundErrorToEmptyResponse, RichError } from "../src/middleware";

function buildRichS3Error(err: { Code: string }): RichError {
  const exception = new S3ServiceException({
    name: err.Code,
    $fault: "client",
    $metadata: {},
  });
  return Object.assign(exception, { Code: err.Code });
}

t.test("MapNotFoundErrorToEmptyResponse", (tap) => {
  tap.plan(6);
  tap.test("NoSuchTagSet returns empty response", ({ ok, equal, end }) => {
    const response = mapNotFoundErrorToEmptyResponse(
      { commandName: "GetBucketTaggingCommand" },
      buildRichS3Error({ Code: "NoSuchTagSet" }),
    );

    ok(response);
    const emptyResponse = response?.output as GetBucketTaggingCommandOutput;
    equal(emptyResponse.TagSet?.length, 0);
    end();
  });

  tap.test("Unmapped error code returns undefined", ({ equal, end }) => {
    const response = mapNotFoundErrorToEmptyResponse(
      { commandName: "GetBucketTaggingCommand" },
      buildRichS3Error({ Code: "BucketNotFound" }),
    );

    equal(response, undefined);
    end();
  });

  tap.test(
    "NoSuchWebsiteConfiguration returns an empty response",
    ({ ok, notOk, end }) => {
      const response = mapNotFoundErrorToEmptyResponse(
        { commandName: "GetBucketWebsiteCommand" },
        buildRichS3Error({ Code: "NoSuchWebsiteConfiguration" }),
      );

      ok(response);
      const emptyResponse = response?.output as GetBucketWebsiteCommandOutput;
      ok(emptyResponse.$metadata);
      notOk(emptyResponse.IndexDocument);
      end();
    },
  );

  tap.test("Unmapped error code returns undefined", ({ equal, end }) => {
    const response = mapNotFoundErrorToEmptyResponse(
      { commandName: "GetBucketWebsiteCommand" },
      buildRichS3Error({ Code: "BucketNotFound" }),
    );

    equal(response, undefined);
    end();
  });

  tap.test(
    "Unmapped command's error code returns undefined",
    ({ equal, end }) => {
      const response = mapNotFoundErrorToEmptyResponse(
        { commandName: "ListBucketsCommand" },
        buildRichS3Error({ Code: "Forbidden" }),
      );

      equal(response, undefined);
      end();
    },
  );

  tap.test(
    "Basic service exception without standard code returns undefined",
    ({ equal, end }) => {
      const response = mapNotFoundErrorToEmptyResponse(
        { commandName: "ListBucketsCommand" },
        buildRichS3Error({ Code: "Forbidden" }),
      );

      equal(response, undefined);
      end();
    },
  );
});
