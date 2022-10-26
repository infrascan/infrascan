import { AccountState } from './index';
import { writeFileSync } from 'fs';

export function generateServiceMap(accountState: AccountState) {
  const graphData = Object.values(accountState).flatMap((resourceCollection) => {
    return resourceCollection.map((resource: any) => ({
      group: 'nodes',
      data: {
        id: resource.Arn,
        type: resource.ResourceKey,
        name: resource.Name ?? resource.Arn,
        node_data: resource
      }
    }));
  });
  writeFileSync('./static/graph.json', JSON.stringify(graphData, undefined, 2), {  });
  return graphData;
}