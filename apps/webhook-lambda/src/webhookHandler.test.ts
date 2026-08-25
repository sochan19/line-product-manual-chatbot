import type {
  IdempotencyGuard,
  OutboundQueue,
  SignatureVerifier,
} from '@line-manual-bot/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebhookHandler } from './webhookHandler.js';

function buildBody(webhookEventId: string, text: string) {
  return JSON.stringify({
    events: [
      {
        type: 'message',
        webhookEventId,
        replyToken: 'reply-token',
        message: { type: 'text', text },
      },
    ],
  });
}

describe('createWebhookHandler', () => {
  let signatureVerifier: SignatureVerifier;
  let idempotencyGuard: IdempotencyGuard;
  let outboundQueue: OutboundQueue;

  beforeEach(() => {
    signatureVerifier = { verify: vi.fn().mockReturnValue(true) };
    idempotencyGuard = { claimEvent: vi.fn().mockResolvedValue(true) };
    outboundQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  });

  it('enqueues a new event and returns 200', async () => {
    const handleWebhook = createWebhookHandler({
      signatureVerifier,
      idempotencyGuard,
      outboundQueue,
    });

    const result = await handleWebhook({
      rawBody: buildBody('event-1', 'こんにちは'),
      signatureHeader: 'valid-signature',
    });

    expect(result.statusCode).toBe(200);
    expect(outboundQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(outboundQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookEventId: 'event-1',
        text: 'こんにちは',
      }),
    );
  });

  it('does not enqueue a duplicate webhookEventId', async () => {
    idempotencyGuard.claimEvent = vi.fn().mockResolvedValue(false);
    const handleWebhook = createWebhookHandler({
      signatureVerifier,
      idempotencyGuard,
      outboundQueue,
    });

    const result = await handleWebhook({
      rawBody: buildBody('event-1', 'こんにちは'),
      signatureHeader: 'valid-signature',
    });

    expect(result.statusCode).toBe(200);
    expect(outboundQueue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature without enqueueing', async () => {
    signatureVerifier.verify = vi.fn().mockReturnValue(false);
    const handleWebhook = createWebhookHandler({
      signatureVerifier,
      idempotencyGuard,
      outboundQueue,
    });

    const result = await handleWebhook({
      rawBody: buildBody('event-1', 'こんにちは'),
      signatureHeader: 'bad-signature',
    });

    expect(result.statusCode).toBe(401);
    expect(idempotencyGuard.claimEvent).not.toHaveBeenCalled();
    expect(outboundQueue.enqueue).not.toHaveBeenCalled();
  });
});
