import { parseWebhookRequestBody } from '@line-manual-bot/adapters';
import type {
  IdempotencyGuard,
  OutboundQueue,
  SignatureVerifier,
} from '@line-manual-bot/domain';

export type WebhookHandlerDeps = {
  signatureVerifier: SignatureVerifier;
  idempotencyGuard: IdempotencyGuard;
  outboundQueue: OutboundQueue;
};

export type WebhookHandlerInput = {
  rawBody: string;
  signatureHeader: string | undefined;
};

export type WebhookHandlerResult = {
  statusCode: number;
};

/**
 * Webhookの受け口を組み立てる。署名検証 → 冪等化 → SQSへ流す、までを担当し、
 * 時間のかかる処理はworker Lambdaに任せてLINEへすぐ応答を返す。
 */
export function createWebhookHandler(deps: WebhookHandlerDeps) {
  return async function handleWebhook(
    input: WebhookHandlerInput,
  ): Promise<WebhookHandlerResult> {
    if (!deps.signatureVerifier.verify(input.rawBody, input.signatureHeader)) {
      return { statusCode: 401 };
    }

    const messages = parseWebhookRequestBody(input.rawBody);
    let hasProcessingFailure = false;

    for (const message of messages) {
      try {
        const isNewEvent = await deps.idempotencyGuard.claimEvent(
          message.webhookEventId,
        );
        if (isNewEvent) {
          await deps.outboundQueue.enqueue(message);
        }
      } catch (error) {
        // 1件の失敗で他のイベントの処理を止めない。冪等性テーブルのTTL(1時間)で
        // 「claim済みだが未処理」の記録は自然に失効する
        hasProcessingFailure = true;
        console.error('Webhookイベントの処理に失敗しました', {
          webhookEventId: message.webhookEventId,
          error,
        });
      }
    }

    return { statusCode: hasProcessingFailure ? 500 : 200 };
  };
}
