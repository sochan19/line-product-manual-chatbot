import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type {
  IncomingTextMessage,
  OutboundQueue,
} from '@line-manual-bot/domain';

export function createSqsOutboundQueue(queueUrl: string): OutboundQueue {
  const client = new SQSClient({});

  return {
    async enqueue(message: IncomingTextMessage) {
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
        }),
      );
    },
  };
}
