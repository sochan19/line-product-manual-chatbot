import type {
  AnswerGenerator,
  IncomingTextMessage,
  ManualChunk,
  ManualSearcher,
  ReplySender,
} from '@line-manual-bot/domain';
import { describe, expect, it, vi } from 'vitest';
import { createWorkerHandler } from './workerHandler.js';

const message: IncomingTextMessage = {
  webhookEventId: 'event-1',
  replyToken: 'reply-token',
  text: 'パスワードの変え方は?',
};

const chunk: ManualChunk = {
  fileName: 'manuals/操作手順.docx',
  text: '# パスワードの変更\n設定画面から変更します。',
  score: 0.9,
};

function createDeps(overrides: {
  chunks?: ManualChunk[];
  searchError?: Error;
  generateError?: Error;
}) {
  const manualSearcher: ManualSearcher = {
    search: overrides.searchError
      ? vi.fn().mockRejectedValue(overrides.searchError)
      : vi.fn().mockResolvedValue(overrides.chunks ?? [chunk]),
  };
  const answerGenerator: AnswerGenerator = {
    generate: overrides.generateError
      ? vi.fn().mockRejectedValue(overrides.generateError)
      : vi.fn().mockResolvedValue('設定画面から変更できます。'),
  };
  const replySender: ReplySender = {
    reply: vi.fn().mockResolvedValue(undefined),
  };

  return { manualSearcher, answerGenerator, replySender };
}

describe('createWorkerHandler', () => {
  it('replies with the generated answer and its source', async () => {
    const deps = createDeps({});

    await createWorkerHandler(deps)(message);

    expect(deps.manualSearcher.search).toHaveBeenCalledWith(message.text);
    expect(deps.replySender.reply).toHaveBeenCalledWith(
      'reply-token',
      '設定画面から変更できます。\n\n出典:\n- 操作手順.docx > パスワードの変更',
    );
  });

  it('passes only the hit chunks and the question to the generator (F-01)', async () => {
    const deps = createDeps({});

    await createWorkerHandler(deps)(message);

    const prompt = vi.mocked(deps.answerGenerator.generate).mock.calls[0]?.[0];
    expect(prompt?.userPrompt).toContain(chunk.text);
    expect(prompt?.userPrompt).toContain(message.text);
  });

  it('replies with the fixed message when nothing hit, without calling the LLM', async () => {
    const deps = createDeps({ chunks: [] });

    await createWorkerHandler(deps)(message);

    expect(deps.answerGenerator.generate).not.toHaveBeenCalled();
    expect(deps.replySender.reply).toHaveBeenCalledWith(
      'reply-token',
      expect.stringContaining('見つかりませんでした'),
    );
  });

  it('rethrows when replying to a no-hit search fails, so SQS can retry', async () => {
    const replyError = new Error('LINEの返信に失敗しました');
    const deps = createDeps({ chunks: [] });
    deps.replySender.reply = vi.fn().mockRejectedValue(replyError);

    await expect(createWorkerHandler(deps)(message)).rejects.toThrow(
      replyError,
    );
  });

  it('replies with the fixed error message and rethrows when the search fails', async () => {
    const searchError = new Error('AI Searchの呼び出しに失敗しました');
    const deps = createDeps({ searchError });

    await expect(createWorkerHandler(deps)(message)).rejects.toThrow(
      searchError,
    );
    expect(deps.replySender.reply).toHaveBeenCalledWith(
      'reply-token',
      expect.stringContaining('回答を準備できませんでした'),
    );
  });

  it('replies with the fixed error message and rethrows when the generation fails', async () => {
    const generateError = new Error('LLMが回答本文を返しませんでした');
    const deps = createDeps({ generateError });

    await expect(createWorkerHandler(deps)(message)).rejects.toThrow(
      generateError,
    );
    expect(deps.replySender.reply).toHaveBeenCalledWith(
      'reply-token',
      expect.stringContaining('回答を準備できませんでした'),
    );
  });

  it('rethrows the original error even if the error reply also fails', async () => {
    const searchError = new Error('AI Searchの呼び出しに失敗しました');
    const deps = createDeps({ searchError });
    deps.replySender.reply = vi
      .fn()
      .mockRejectedValue(new Error('LINEの返信に失敗しました'));

    await expect(createWorkerHandler(deps)(message)).rejects.toThrow(
      searchError,
    );
  });
});
