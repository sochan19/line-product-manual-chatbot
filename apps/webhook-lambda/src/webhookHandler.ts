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

export function createWebhookHandler(deps: WebhookHandlerDeps) {
  return async function handleWebhook(
    input: WebhookHandlerInput,
  ): Promise<WebhookHandlerResult> {
    if (!deps.signatureVerifier.verify(input.rawBody, input.signatureHeader)) {
      return { statusCode: 401 };
    }

    const messages = parseWebhookRequestBody(input.rawBody);

    for (const message of messages) {
      const isNewEvent = await deps.idempotencyGuard.claimEvent(
        message.webhookEventId,
      );
      if (isNewEvent) {
        await deps.outboundQueue.enqueue(message);
      }
    }

    return { statusCode: 200 };
  };
}
