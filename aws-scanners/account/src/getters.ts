import {
  AlternateContactType,
  GetAlternateContactCommand,
  ListRegionsCommand,
  type AccountClient,
  type GetAlternateContactCommandInput,
} from "@aws-sdk/client-account";
import type { AwsContext, Connector } from "@infrascan/shared-types";
import { call, recordState } from "./state";

const NEXT_TOKEN = { request: "NextToken", response: "NextToken" } as const;

/**
 * The alternate contact types that are checked.
 */
export const ALTERNATE_CONTACT_TYPES: AlternateContactType[] = [
  AlternateContactType.SECURITY,
  AlternateContactType.BILLING,
  AlternateContactType.OPERATIONS,
];

/**
 * What is recorded for a `GetAlternateContact` call. The contact's name, title, email address and phone number are
 * personal data and are never recorded: only whether a contact of the type is set.
 */
export interface RecordedAlternateContact {
  AlternateContactType?: string;
  isSet: boolean;
}

/**
 * Every Region of the scanned account and its opt-in status. No `AccountId` is passed, so this is the calling
 * account's own view.
 */
export async function ListRegions(
  client: AccountClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = await call(
    context,
    (input) => client.send(new ListRegionsCommand(input)),
    {},
    NEXT_TOKEN,
  );
  await recordState(connector, context, "ListRegions", state);
}

/**
 * Whether each alternate contact is set on the scanned account. A contact that is not set is reported by AWS as
 * `ResourceNotFoundException`, which is recorded like any other error and interpreted by the entity.
 */
export async function GetAlternateContact(
  client: AccountClient,
  connector: Connector,
  context: AwsContext,
): Promise<void> {
  const state = [];
  for (const contactType of ALTERNATE_CONTACT_TYPES) {
    state.push(
      ...(await call(
        context,
        async (
          input: GetAlternateContactCommandInput,
        ): Promise<RecordedAlternateContact> => {
          const result = await client.send(
            new GetAlternateContactCommand(input),
          );
          return {
            AlternateContactType:
              result.AlternateContact?.AlternateContactType ??
              input.AlternateContactType,
            isSet: result.AlternateContact != null,
          };
        },
        { AlternateContactType: contactType },
      )),
    );
  }
  await recordState(connector, context, "GetAlternateContact", state);
}
