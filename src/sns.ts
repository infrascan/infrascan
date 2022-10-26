import { SNS } from 'aws-sdk';
import { persistToFileFactory, Tag } from './utils';

export interface Subscription {
  Arn?: string,
  Name?: string,
  Owner?: string,
  Protocol?: string, // TODO: constrain
  Endpoint?: string,
  TopicArn?: string
}

export interface SnsTopic {
  ResourceKey: 'SNS',
  Arn: string,
  Name: string,
  LambdaSuccessFeedbackSampleRate?: string,
  Owner?: string,
  SubscriptionsPending?: string,
  FirehouseSuccessFeedbackSampleRate?: string,
  SubscriptionsConfirmed?: string,
  FifoTopic?: string,
  SQSSuccessFeedbackSampleRate?: string,
  HTTPSuccessFeedbackSampleRate?: string,
  ApplicationSuccessFeedbackSampleRate?: string,
  DisplayName?: string,
  ContentBasedDeduplication?: any,
  SubscriptionsDeleted?: any,
  DeliveryPolicy?: any,
  EffectiveDeliveryPolicy?: any,
  Policy?: any,
  Subscriptions?: Subscription[],
  Tags?: Tag[]
};

export async function scanTopics(accountId: string, snsClient: SNS): Promise<SnsTopic[]> {
  const saveToFile = persistToFileFactory(accountId, 'sns');
  const snsState: SnsTopic[] = [];
  
  // Pull all topics in scope
  console.log('Start SNS.listTopics');
  const topics = await snsClient.listTopics().promise();
  console.log('End SNS.listTopics');
  for(let topic of topics.Topics ?? []) {
    // Get the topic's attributes
    if(topic.TopicArn) {
      const topicState: SnsTopic = {
        ResourceKey: 'SNS',
        Arn: topic.TopicArn,
        Name: topic.TopicArn
      };
      const attributes = await snsClient.getTopicAttributes({ TopicArn: topic.TopicArn }).promise();
      const formattedAttributes = { ...attributes.Attributes };
      formattedAttributes.Policy = JSON.parse(attributes?.Attributes?.Policy ?? "{}");
      formattedAttributes.EffectiveDeliveryPolicy = JSON.parse(attributes?.Attributes?.EffectiveDeliveryPolicy ?? "{}");
      formattedAttributes.DeliveryPolicy = JSON.parse(attributes?.Attributes?.DeliveryPolicy ?? "{}");
      Object.assign(topicState, formattedAttributes);

      const subscriptions = await snsClient.listSubscriptionsByTopic({ TopicArn: topic.TopicArn }).promise();
      topicState["Subscriptions"] = subscriptions.Subscriptions?.map((sub) => ({
        Arn: sub.SubscriptionArn,
        Name: sub.SubscriptionArn,
        Protocol: sub.Protocol,
        Endpoint: sub.Endpoint,
        Owner: sub.Owner,
        TopicArn: sub.TopicArn
      }));

      const tags = await snsClient.listTagsForResource({ ResourceArn: topic.TopicArn }).promise();
      topicState["Tags"] = tags.Tags;
      snsState.push(topicState);
    }
  }
  
  saveToFile(snsState);
  return snsState;
}