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

/** infra/lambda-worker.tf がworker Lambdaに渡す環境変数と同じ組 */
const parameterNameByEnvVar = {
  LINE_CHANNEL_ACCESS_TOKEN_PARAMETER_NAME:
    '/line-manual-bot/line/channel-access-token',
  ANTHROPIC_API_KEY_PARAMETER_NAME: '/line-manual-bot/anthropic/api-key',
  CLOUDFLARE_AI_SEARCH_TOKEN_PARAMETER_NAME:
    '/line-manual-bot/cloudflare/ai-search-token',
  CLOUDFLARE_ACCOUNT_ID_PARAMETER_NAME:
    '/line-manual-bot/cloudflare/account-id',
};

describe('worker handler のコールドスタートキャッシュ', () => {
  beforeEach(() => {
    vi.resetModules();
    getSsmParameter.mockReset();
    for (const [envVar, parameterName] of Object.entries(
      parameterNameByEnvVar,
    )) {
      process.env[envVar] = parameterName;
    }
    process.env.AI_SEARCH_INSTANCE_NAME = 'line-manual-bot';
  });

  it('秘密情報をすべてSSMから読む', async () => {
    getSsmParameter.mockResolvedValue('dummy-value');

    const { handler } = await import('./handler.js');
    const invoke = handler as unknown as (event: SQSEvent) => Promise<void>;
    await invoke({ Records: [] } as unknown as SQSEvent);

    for (const parameterName of Object.values(parameterNameByEnvVar)) {
      expect(getSsmParameter).toHaveBeenCalledWith(parameterName);
    }
  });

  it('SSM取得が一時的に失敗しても、次回の呼び出しで再試行する', async () => {
    // 1回のコールドスタートで複数のパラメータをまとめて読むため、
    // 呼び出し回数から「何回目の組み立てか」を求めてエラー文言を変える
    const parameterCount = Object.keys(parameterNameByEnvVar).length;
    let callCount = 0;
    getSsmParameter.mockImplementation(() => {
      callCount += 1;
      const buildCount = Math.ceil(callCount / parameterCount);
      return Promise.reject(new Error(`SSM一時エラー(${buildCount}回目)`));
    });

    const { handler } = await import('./handler.js');
    const invoke = handler as unknown as (event: SQSEvent) => Promise<void>;

    await expect(invoke(buildEvent())).rejects.toThrow('SSM一時エラー(1回目)');

    // 2回目の呼び出しでもSSM取得が再試行されること(=1回目の失敗したPromiseが
    // キャッシュされたまま使い回されていないこと)を確認する。
    await expect(invoke(buildEvent())).rejects.toThrow('SSM一時エラー(2回目)');

    expect(getSsmParameter).toHaveBeenCalledTimes(parameterCount * 2);
  });
});
