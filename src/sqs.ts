import { SQS } from 'aws-sdk';

export async function scanQueues(sqsClient: SQS): Promise<any> {
  const sqsState: Array<any> = [];
  
  // Pull all queues in scope
  console.log('Start SQS.listQueues');
  const queues = await sqsClient.listQueues().promise();
  console.log('End SQS.listQueues');
  for(let queue of queues.QueueUrls ?? []) {
    const queueState: any = {};
    queueState["queueUrl"] = queue;
    // Get the queue's attributes
    const attributes = await sqsClient.getQueueAttributes({ QueueUrl: queue }).promise();
    queueState["attributes"] = attributes.Attributes;

    const tags = await sqsClient.listQueueTags({ QueueUrl: queue }).promise();
    queueState["tags"] = tags.Tags;

    sqsState.push(queueState);
  }
  
  return sqsState;
}