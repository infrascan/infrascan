import t from "tap";
import type { Connector, TranslatedEntity } from "@infrascan/shared-types";
import { generateNodesFromEntity } from ".";

type Value = { id?: string; explode?: boolean };

function buildEntity(values: Value[]) {
  return {
    version: "0.0.0",
    debugLabel: "test-entity",
    provider: "aws",
    command: "Test",
    category: "test",
    subcategory: "test",
    nodeType: "test-node",
    selector: "Test|Test|[]",
    getState: async () => [{ values }],
    translate: (state: { values: Value[] }) => state.values,
    components: {
      $graph(val: Value) {
        if (val.explode) {
          throw new TypeError("Cannot read properties of undefined");
        }
        return { id: val.id, label: val.id, nodeType: "test-node" };
      },
    },
  } as unknown as TranslatedEntity<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const connector = {} as Connector;
const context = { account: "000000000000", region: "us-east-1" };

t.test(
  "a resource whose components throw is skipped rather than aborting the entity",
  async ({ same }) => {
    const entity = buildEntity([
      { id: "first" },
      { explode: true },
      { id: "last" },
    ]);
    const ids: string[] = [];
    for await (const node of generateNodesFromEntity(
      connector,
      context,
      entity,
    )) {
      ids.push(node.$graph.id);
    }
    same(ids, ["first", "last"]);
  },
);
