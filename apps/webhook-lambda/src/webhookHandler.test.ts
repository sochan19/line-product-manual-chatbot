import type {
  IdempotencyGuard,
  OutboundQueue,
  SignatureVerifier,
} from '@line-manual-bot/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebhookHandler } from './webhookHandler.js';

/** LINEから届くWebhookイベント1件分(テキストメッセージ)を作る */
function buildEvent(webhookEventId: string, text: string) {
  return {
    type: 'message',
    webhookEventId,
    replyToken: 'reply-token',
    message: { type: 'text', text },
  };
}

/** イベント1件だけを含むWebhookのリクエストボディ(JSON文字列)を作る */
function buildBody(webhookEventId: string, text: string) {
  return JSON.stringify({ events: [buildEvent(webhookEventId, text)] });
}

/** イベントを複数含むリクエストボディを作る(1件の失敗が他に波及しないかの確認用) */
function buildMultiEventBody(
  events: Array<{ webhookEventId: string; text: string }>,
) {
  return JSON.stringify({
    events: events.map((event) => buildEvent(event.webhookEventId, event.text)),
  });
}

// LINEのWebhookを受けて、署名検証・冪等化をしたうえでSQSへ流し、すぐHTTPステータスを返す
describe('createWebhookHandler', () => {
  let signatureVerifier: SignatureVerifier;
  let idempotencyGuard: IdempotencyGuard;
  let outboundQueue: OutboundQueue;

  beforeEach(() => {
    signatureVerifier = { verify: vi.fn().mockReturnValue(true) };
    idempotencyGuard = { claimEvent: vi.fn().mockResolvedValue(true) };
    outboundQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  });

  // 署名が不正なリクエストは、本文を読む前に401で打ち切る(入口のガード節)
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

  // 正常系: 初めて見るイベントをSQSへ流し、LINEには即200を返す
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

  // 同じwebhookEventIdの再送は二重処理しない(二重返信の防止)
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

  // 冪等化(DynamoDB書き込み)が1件失敗しても残りは処理し、失敗は500で表に出す
  it('continues processing remaining events when claiming one fails, and returns 500', async () => {
    idempotencyGuard.claimEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error('DynamoDBへの書き込みに失敗しました'))
      .mockResolvedValueOnce(true);
    const handleWebhook = createWebhookHandler({
      signatureVerifier,
      idempotencyGuard,
      outboundQueue,
    });

    const result = await handleWebhook({
      rawBody: buildMultiEventBody([
        { webhookEventId: 'event-1', text: '1件目' },
        { webhookEventId: 'event-2', text: '2件目' },
      ]),
      signatureHeader: 'valid-signature',
    });

    expect(result.statusCode).toBe(500);
    expect(outboundQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(outboundQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ webhookEventId: 'event-2' }),
    );
  });

  // SQSへの送信が1件失敗しても残りは処理し、失敗は500で表に出す
  it('continues processing remaining events when enqueueing one fails, and returns 500', async () => {
    outboundQueue.enqueue = vi
      .fn()
      .mockRejectedValueOnce(new Error('SQSへの送信に失敗しました'))
      .mockResolvedValueOnce(undefined);
    const handleWebhook = createWebhookHandler({
      signatureVerifier,
      idempotencyGuard,
      outboundQueue,
    });

    const result = await handleWebhook({
      rawBody: buildMultiEventBody([
        { webhookEventId: 'event-1', text: '1件目' },
        { webhookEventId: 'event-2', text: '2件目' },
      ]),
      signatureHeader: 'valid-signature',
    });

    expect(result.statusCode).toBe(500);
    expect(outboundQueue.enqueue).toHaveBeenCalledTimes(2);
    expect(outboundQueue.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ webhookEventId: 'event-2' }),
    );
  });
});
