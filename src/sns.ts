import { SNS } from 'aws-sdk';

export async function scanTopics(snsClient: SNS): Promise<any> {
  const snsState: Array<any> = [];
  
  // Pull all topics in scope
  console.log('Start SNS.listTopics');
  const topics = await snsClient.listTopics().promise();
  console.log('End SNS.listTopics');
  for(let topic of topics.Topics ?? []) {
    const topicState: any = {};
    // Get the topic's attributes
    if(topic.TopicArn) {
      const attributes = await snsClient.getTopicAttributes({ TopicArn: topic.TopicArn }).promise();
      topicState["topic"] = attributes.Attributes;

      const subscriptions = await snsClient.listSubscriptionsByTopic({ TopicArn: topic.TopicArn }).promise();
      topicState["subscriptions"] = subscriptions.Subscriptions;

      const tags = await snsClient.listTagsForResource({ ResourceArn: topic.TopicArn }).promise();
      topicState["tags"] = tags.Tags;
    }
    snsState.push(topicState);
  }
  
  return snsState;
}