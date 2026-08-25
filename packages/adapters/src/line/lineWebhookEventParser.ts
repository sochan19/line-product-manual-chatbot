import type { IncomingTextMessage } from '@line-manual-bot/domain';
import type { webhook } from '@line/bot-sdk';

export function parseIncomingTextMessages(
  events: webhook.Event[],
): IncomingTextMessage[] {
  const messages: IncomingTextMessage[] = [];

  for (const event of events) {
    if (event.type !== 'message') continue;
    if (event.message.type !== 'text') continue;
    if (!event.replyToken) continue;

    messages.push({
      webhookEventId: event.webhookEventId,
      replyToken: event.replyToken,
      text: event.message.text,
    });
  }

  return messages;
}

/** LINEの生Webhookリクエストボディ(JSON文字列)からテキストメッセージだけを取り出す。@line/bot-sdkの型への依存をadapters層に閉じ込めるための入り口。 */
export function parseWebhookRequestBody(
  rawBody: string,
): IncomingTextMessage[] {
  const body = JSON.parse(rawBody) as { events: webhook.Event[] };
  return parseIncomingTextMessages(body.events);
}
