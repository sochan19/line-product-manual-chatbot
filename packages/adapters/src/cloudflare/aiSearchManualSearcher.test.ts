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
  it('posts the question in the OpenAI-compatible messages format', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(searchResponse)));
    vi.stubGlobal('fetch', fetchMock);

    const chunks = await createAiSearchManualSearcher(config).search(
      'パスワードの変え方は?',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-1/ai-search/instances/line-manual-bot/search',
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({
      messages: [{ role: 'user', content: 'パスワードの変え方は?' }],
    });
    expect(chunks).toEqual([
      {
        fileName: 'manuals/操作手順.docx',
        text: '設定画面から変更します。',
        score: 0.9,
      },
    ]);
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
});
