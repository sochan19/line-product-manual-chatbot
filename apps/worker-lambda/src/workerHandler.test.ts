import type { IncomingTextMessage, ReplySender } from '@line-manual-bot/domain';
import { describe, expect, it, vi } from 'vitest';
import { createWorkerHandler } from './workerHandler.js';

describe('createWorkerHandler', () => {
  it('replies with the received text unchanged', async () => {
    const replySender: ReplySender = {
      reply: vi.fn().mockResolvedValue(undefined),
    };
    const handleMessage = createWorkerHandler({ replySender });

    const message: IncomingTextMessage = {
      webhookEventId: 'event-1',
      replyToken: 'reply-token',
      text: 'こんにちは',
    };

    await handleMessage(message);

    expect(replySender.reply).toHaveBeenCalledWith('reply-token', 'こんにちは');
  });
});
