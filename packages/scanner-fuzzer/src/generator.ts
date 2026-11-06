import { NormalizedSchema } from "@smithy/core/schema";
import type { ValueFactory } from "./values";

/**
 * The parts of an AWS SDK command the generator relies on. Every v3 command
 * carries its Smithy operation schema.
 */
export interface SchemaCommand {
  schema?: unknown;
  input?: unknown;
}

/**
 * Pagination members are never generated at the top level of a response, so
 * paginated getters always terminate.
 */
const PAGINATION_MEMBER =
  /^(NextToken|nextToken|Next|Marker|NextMarker|NextPageMarker|ContinuationToken|NextContinuationToken|IsTruncated|NextRecordName|NextRecordType|NextRecordIdentifier|LastEvaluatedTableName|NextKeyMarker|NextUploadIdMarker|position)$/;

/**
 * Deeply recursive shapes are cut off past this depth.
 */
const MAX_DEPTH = 7;

const STATIC_OPERATION_SCHEMA = 9;

type OperationOverride = (
  generated: Record<string, unknown>,
  command: SchemaCommand,
  values: ValueFactory,
) => Record<string, unknown>;

/**
 * Operations the SDK itself calls to bootstrap a scan. Their responses must be
 * coherent (the scanned account and region) for the scan to proceed at all.
 */
const OPERATION_OVERRIDES: Record<string, OperationOverride> = {
  GetCallerIdentity: (generated, _, values) => ({
    ...generated,
    Account: values.context.account,
  }),
  DescribeRegions: (generated, _, values) => ({
    ...generated,
    Regions: [{ RegionName: values.context.region }],
  }),
};

/**
 * Resolve the name and output schema of a command's operation. Commands carry
 * either a static schema tuple (`[9, namespace, name, traits, input, output]`)
 * or an operation schema object.
 */
export function describeOperation(command: SchemaCommand): {
  name: string;
  output: unknown;
} {
  const { schema } = command;
  if (Array.isArray(schema) && schema[0] === STATIC_OPERATION_SCHEMA) {
    return { name: String(schema[2]), output: schema[5] };
  }
  if (schema != null && typeof schema === "object" && "output" in schema) {
    const operation = schema as { name?: string; output: unknown };
    return { name: String(operation.name), output: operation.output };
  }
  throw new TypeError(
    "Command has no Smithy operation schema, the AWS SDK client may be too old to fuzz",
  );
}

/**
 * Builds AWS API responses from Smithy schemas, shaped by the current profile.
 */
export class ResponseGenerator {
  private readonly values: ValueFactory;

  constructor(values: ValueFactory) {
    this.values = values;
  }

  respond(command: SchemaCommand): {
    operation: string;
    response: Record<string, unknown>;
  } {
    const { name, output } = describeOperation(command);
    const generated = this.generate(output);
    let response: Record<string, unknown> =
      generated != null && typeof generated === "object"
        ? (generated as Record<string, unknown>)
        : {};
    const override = OPERATION_OVERRIDES[name];
    if (override != null) {
      response = override(response, command, this.values);
    }
    return { operation: name, response };
  }

  generate(schema: unknown, memberName?: string, depth = 0): unknown {
    const ns = NormalizedSchema.of(
      schema as Parameters<typeof NormalizedSchema.of>[0],
    );
    const { random, profile } = this.values;

    if (ns.isUnitSchema()) {
      return undefined;
    }
    if (ns.isUnionSchema()) {
      const members = [...ns.structIterator()];
      if (members.length === 0) {
        return {};
      }
      const [member, memberSchema] = random.pick(members);
      return { [member]: this.generate(memberSchema, member, depth + 1) };
    }
    if (ns.isStructSchema()) {
      if (depth > MAX_DEPTH) {
        return {};
      }
      const out: Record<string, unknown> = {};
      for (const [member, memberSchema] of ns.structIterator()) {
        const traits = memberSchema.getMergedTraits() ?? {};
        const skip =
          (depth === 0 && PAGINATION_MEMBER.test(member)) ||
          // Transport level members aren't part of the modelled response body
          traits.httpHeader != null ||
          traits.httpResponseCode != null ||
          (!traits.required && !random.chance(profile.presence));
        if (!skip) {
          out[member] = this.generate(memberSchema, member, depth + 1);
        }
      }
      return out;
    }
    if (ns.isListSchema()) {
      if (depth > MAX_DEPTH) {
        return [];
      }
      // Members are usually plural ("Functions"), their items singular
      const itemName = memberName?.replace(/s$/, "");
      return Array.from({ length: this.collectionSize() }, () =>
        this.generate(ns.getValueSchema(), itemName, depth + 1),
      );
    }
    if (ns.isMapSchema()) {
      const out: Record<string, unknown> = {};
      for (let i = 0; i < this.collectionSize(); i += 1) {
        out[this.values.string("key")] = this.generate(
          ns.getValueSchema(),
          memberName,
          depth + 1,
        );
      }
      return out;
    }
    if (ns.isBooleanSchema()) {
      return random.chance(0.5);
    }
    if (ns.isBigIntegerSchema()) {
      return BigInt(random.int(100));
    }
    if (ns.isNumericSchema() || ns.isBigDecimalSchema()) {
      return random.int(2000);
    }
    if (ns.isTimestampSchema()) {
      return new Date(Date.UTC(2025, 0, 1) + random.int(1e10));
    }
    if (ns.isBlobSchema()) {
      return new Uint8Array([1, 2, 3]);
    }
    if (ns.isDocumentSchema()) {
      return {};
    }
    if (ns.isStringSchema()) {
      return this.values.string(memberName);
    }
    return undefined;
  }

  private collectionSize(): number {
    const { random, profile } = this.values;
    return random.chance(profile.emptyCollection) ? 0 : 1 + random.int(3);
  }
}
