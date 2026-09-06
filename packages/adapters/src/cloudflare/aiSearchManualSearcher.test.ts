import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiSearchManualSearcher } from './aiSearchManualSearcher.js';

const config = {
  accountId: 'account-1',
  instanceName: 'line-manual-bot',
  apiToken: 'test-token',
};

const searchResponse = {
  success: true,
  result: {
    data: [
      {
        score: 0.9,
        text: '設定画面から変更します。',
        item: { key: 'manuals/操作手順.docx' },
      },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAiSearchManualSearcher', () => {
  it('posts the question to the autorag search endpoint as a query', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(searchResponse)));
    vi.stubGlobal('fetch', fetchMock);

    const chunks = await createAiSearchManualSearcher(config).search(
      'パスワードの変え方は?',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    // 検索系APIのパスは製品名(AI Search)ではなく旧名のautorag/rags。
    // ai-search/instances/... に投げると401(ルート不在)になる
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-1/autorag/rags/line-manual-bot/search',
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({ query: 'パスワードの変え方は?' });
    expect(chunks).toEqual([
      {
        fileName: 'manuals/操作手順.docx',
        text: '設定画面から変更します。',
        score: 0.9,
      },
    ]);
  });

  it('does not send the OpenAI-compatible messages format', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(searchResponse)));
    vi.stubGlobal('fetch', fetchMock);

    await createAiSearchManualSearcher(config).search('質問');

    // messages形式で送ると400 (`expected string, received undefined, path: body.query`)。
    // 実際にP1で作り込んだ不具合なので回帰テストとして残す
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(init.body)).not.toHaveProperty('messages');
  });

  it('throws when the API responds with an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })),
    );

    await expect(
      createAiSearchManualSearcher(config).search('質問'),
    ).rejects.toThrow('HTTP 403');
  });

  it('throws when the response body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>gateway error</html>')),
    );

    // 読めないレスポンスを空のヒットとして扱うと、根拠なしの回答につながる(F-01)
    await expect(
      createAiSearchManualSearcher(config).search('質問'),
    ).rejects.toThrow();
  });

  it('propagates a timeout so the worker can fall back to the fixed message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
    );

    await expect(
      createAiSearchManualSearcher(config).search('質問'),
    ).rejects.toThrow('timed out');
  });
});
