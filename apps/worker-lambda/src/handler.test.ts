import type { SQSEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSsmParameter = vi.fn();

vi.mock('@line-manual-bot/adapters', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@line-manual-bot/adapters')>();
  return { ...actual, getSsmParameter };
});

function buildEvent(): SQSEvent {
  return {
    Records: [
      {
        body: JSON.stringify({
          webhookEventId: 'event-1',
          replyToken: 'reply-token',
          text: 'こんにちは',
        }),
      },
    ],
  } as SQSEvent;
}

describe('worker handler のコールドスタートキャッシュ', () => {
  beforeEach(() => {
    vi.resetModules();
    getSsmParameter.mockReset();
    process.env.LINE_CHANNEL_ACCESS_TOKEN_PARAMETER_NAME =
      '/line-manual-bot/line/channel-access-token';
  });

  it('SSM取得が一時的に失敗しても、次回の呼び出しで再試行する', async () => {
    getSsmParameter.mockRejectedValueOnce(new Error('SSM一時エラー(1回目)'));
    getSsmParameter.mockRejectedValueOnce(new Error('SSM一時エラー(2回目)'));

    const { handler } = await import('./handler.js');
    const invoke = handler as unknown as (event: SQSEvent) => Promise<void>;

    await expect(invoke(buildEvent())).rejects.toThrow('SSM一時エラー(1回目)');

    // 2回目の呼び出しでもSSM取得が再試行されること(=1回目の失敗したPromiseが
    // キャッシュされたまま使い回されていないこと)を確認する。
    await expect(invoke(buildEvent())).rejects.toThrow('SSM一時エラー(2回目)');

    expect(getSsmParameter).toHaveBeenCalledTimes(2);
  });
});
