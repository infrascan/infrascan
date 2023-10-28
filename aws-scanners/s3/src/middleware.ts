import type {
  FinalizeHandler,
  FinalizeHandlerArguments,
  FinalizeHandlerOutput,
  HandlerExecutionContext,
} from "@smithy/types";
import {
  S3Client,
  ServiceInputTypes,
  ServiceOutputTypes,
  S3ServiceException,
  _Error,
} from "@aws-sdk/client-s3";

/**
 * The class for errors from S3 doesn't include the Code used to identify the Errors, unlike the public `_Error` interface does.
 * To safely ignore the known errors in `ignoreS3ConfigNotFoundErrors`, we need to assert that the error being thrown has the correct interface.
 */
function isRichError(
  err: S3ServiceException & { Code?: string },
): err is _Error & S3ServiceException {
  return err.Code != null;
}

/**
 * The S3 Client throws a resource not found in some cases when fetching optional config relating to a bucket
 * (e.g. GetBucketTaggingCommand, and GetBucketWebsiteCommand). In the case of a scanner, it's more useful to
 * receive an empty object response than it is to error. This middleware will catch errors and, where appropriate,
 * return an empty object instead.
 */
function ignoreS3ConfigNotFoundErrors(
  next: FinalizeHandler<ServiceInputTypes, ServiceOutputTypes>,
  context: HandlerExecutionContext,
): FinalizeHandler<ServiceInputTypes, ServiceOutputTypes> {
  return async function mapNotFoundErrors(
    args: FinalizeHandlerArguments<ServiceInputTypes>,
  ): Promise<FinalizeHandlerOutput<ServiceOutputTypes>> {
    try {
      return await next(args);
    } catch (err: unknown) {
      if (err instanceof S3ServiceException && isRichError(err)) {
        if (
          context.commandName === "GetBucketTaggingCommand" &&
          err.Code === "NoSuchTagSet"
        ) {
          return {
            output: {
              $metadata: {},
              TagSet: [],
            },
            response: err,
          };
        }
        if (
          context.commandName === "GetBucketWebsiteCommand" &&
          err.Code === "NoSuchWebsiteConfiguration"
        ) {
          return {
            output: {
              $metadata: {},
            },
            response: err,
          };
        }
      }
      throw err;
    }
  };
}

export function registerMiddleware(client: S3Client) {
  client.middlewareStack.add(ignoreS3ConfigNotFoundErrors, {
    step: "finalizeRequest",
    name: "ignoreS3ConfigNotFoundErrors",
    tags: ["ErrorHandling"],
    priority: "high",
  });
}
