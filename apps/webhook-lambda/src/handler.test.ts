import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSsmParameter = vi.fn();

vi.mock('@line-manual-bot/adapters', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@line-manual-bot/adapters')>();
  return { ...actual, getSsmParameter };
});

function buildEvent(): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify({ events: [] }),
    isBase64Encoded: false,
    headers: {},
  } as APIGatewayProxyEventV2;
}

describe('webhook handler のコールドスタートキャッシュ', () => {
  beforeEach(() => {
    vi.resetModules();
    getSsmParameter.mockReset();
    process.env.IDEMPOTENCY_TABLE_NAME = 'idempotency-table';
    process.env.OUTBOUND_QUEUE_URL = 'https://sqs.example.com/queue';
    process.env.LINE_CHANNEL_SECRET_PARAMETER_NAME =
      '/line-manual-bot/line/channel-secret';
  });

  it('SSM取得が一時的に失敗しても、次回の呼び出しで再試行する', async () => {
    getSsmParameter.mockRejectedValueOnce(new Error('SSM一時エラー'));
    getSsmParameter.mockResolvedValueOnce('dummy-channel-secret');

    const { handler } = await import('./handler.js');

    await expect(handler(buildEvent())).rejects.toThrow('SSM一時エラー');

    // 2回目はSSM取得に成功し、キャッシュされた失敗が再スローされないことを確認する。
    // 署名ヘッダーがないので401になるが、それは正常な検証結果であり
    // 1回目のSSMエラーの再スローではない。
    const result = await handler(buildEvent());

    expect(result).toEqual({ statusCode: 401 });
    expect(getSsmParameter).toHaveBeenCalledTimes(2);
  });
});
