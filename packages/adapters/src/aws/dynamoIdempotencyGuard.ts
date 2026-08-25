import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { IdempotencyGuard } from '@line-manual-bot/domain';

const idempotencyRecordTtlSeconds = 60 * 60; // SQSの再試行/可視性タイムアウトが収まればよいだけの短命レコード

export function createDynamoIdempotencyGuard(
  tableName: string,
): IdempotencyGuard {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  return {
    async claimEvent(webhookEventId) {
      const expiresAt =
        Math.floor(Date.now() / 1000) + idempotencyRecordTtlSeconds;
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: { webhookEventId, expiresAt },
            ConditionExpression: 'attribute_not_exists(webhookEventId)',
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
          return false;
        }
        throw error;
      }
    },
  };
}
