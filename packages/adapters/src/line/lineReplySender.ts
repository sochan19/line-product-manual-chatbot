import type { ReplySender } from '@line-manual-bot/domain';
import { messagingApi } from '@line/bot-sdk';

export function createLineReplySender(channelAccessToken: string): ReplySender {
  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  return {
    async reply(replyToken, text) {
      await client.replyMessage({
        replyToken,
        messages: [{ type: 'text', text }],
      });
    },
  };
}
