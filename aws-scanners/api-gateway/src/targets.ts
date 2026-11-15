export const DEFAULT_PARTITION = "aws";

/**
 * Builds the ARN of an HTTP or WebSocket API, which is used as its node id.
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/arn-format-reference.html
 */
export function formatApiArn(
  region: string,
  apiId: string,
  partition: string = DEFAULT_PARTITION,
): string {
  return `arn:${partition}:apigateway:${region}::/apis/${apiId}`;
}
