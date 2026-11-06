import type { CommandCallMetadata, Serialized } from "@infrascan/shared-types";
import {
  type ApiChildResource,
  formatApiArn,
  formatApiChildArn,
} from "../targets";

/**
 * Shape shared by the translated state of every resource scanned per API
 * (routes, integrations, authorizers, stages).
 */
export type ApiChildState = Serialized<{
  $metadata: CommandCallMetadata;
  $parameters?: { ApiId: string | undefined };
}>;

export function getParentApiArn(val: ApiChildState): string {
  return formatApiArn(
    val.$metadata.region,
    val.$parameters!.ApiId!,
    val.$metadata.partition,
  );
}

export function getApiChildArn(
  val: ApiChildState,
  resource: ApiChildResource,
  id: string,
): string {
  return formatApiChildArn(getParentApiArn(val), resource, id);
}

export function formatTags(tags?: Record<string, string>) {
  if (tags == null) {
    return undefined;
  }
  return Object.entries(tags).map(([key, value]) => ({ key, value }));
}
