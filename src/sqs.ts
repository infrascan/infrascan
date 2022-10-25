import { SQS } from 'aws-sdk';
import { persistToFileFactory, Tag } from './utils';

export interface SqsQueue {
  ResourceKey: 'SQS',
  QueueUrl: string,
  Arn?: string,
  Tags?: Tag[]
}

export async function scanQueues(accountId: string, sqsClient: SQS): Promise<SqsQueue[]> {
  const saveToFile = persistToFileFactory(accountId, 'sqs');
  const sqsState: SqsQueue[] = [];
  
  // Pull all queues in scope
  console.log('Start SQS.listQueues');
  const queues = await sqsClient.listQueues().promise();
  console.log('End SQS.listQueues');
  for(let queue of queues.QueueUrls ?? []) {
    const queueState: SqsQueue = {
      ResourceKey: 'SQS',
      QueueUrl: queue
    };
    // Get the queue's attributes
    const attributes = await sqsClient.getQueueAttributes({ QueueUrl: queue, AttributeNames: ['QueueArn'] }).promise();
    if(attributes?.Attributes?.QueueArn) {
      queueState["Arn"] = attributes?.Attributes?.QueueArn;
    }

    const tags = await sqsClient.listQueueTags({ QueueUrl: queue }).promise();
    if(tags.Tags) {
      queueState["Tags"] = Object.entries(tags.Tags).map(([key, value]) => ({
        Key: key,
        Value: value
      }));
    }

    sqsState.push(queueState);
  }
  
  saveToFile(sqsState);
  return sqsState;
}