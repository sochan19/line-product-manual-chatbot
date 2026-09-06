import type { AnswerPrompt } from '@line-manual-bot/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHaikuAnswerGenerator } from './haikuAnswerGenerator.js';

const { createMessage, constructClient } = vi.hoisted(() => ({
  createMessage: vi.fn(),
  constructClient: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMessage };
    constructor(options: unknown) {
      constructClient(options);
    }
  },
}));

const prompt: AnswerPrompt = {
  systemPrompt: 'マニュアルの抜粋だけを根拠に答えてください。',
  userPrompt:
    '以下はマニュアルの抜粋です。\n\n[抜粋1]\n本文\n\n質問: 変え方は?',
};

beforeEach(() => {
  createMessage.mockReset();
  constructClient.mockReset();
});

describe('createHaikuAnswerGenerator', () => {
  it('sends the prompt to Claude Haiku 4.5 without any tool (F-01)', async () => {
    createMessage.mockResolvedValue({
      content: [{ type: 'text', text: '設定画面から変更できます。' }],
    });

    const answer =
      await createHaikuAnswerGenerator('test-key').generate(prompt);

    expect(answer).toBe('設定画面から変更できます。');
    const request = createMessage.mock.calls[0]?.[0];
    expect(request.model).toBe('claude-haiku-4-5');
    expect(request.system).toBe(prompt.systemPrompt);
    expect(request.messages).toEqual([
      { role: 'user', content: prompt.userPrompt },
    ]);
    // ツールを渡していないこと自体がF-01の担保なので、テストで固定する
    expect(request).not.toHaveProperty('tools');
  });

  it('joins multiple text blocks into one answer', async () => {
    createMessage.mockResolvedValue({
      content: [
        { type: 'text', text: '1文目' },
        { type: 'text', text: '2文目' },
      ],
    });

    await expect(
      createHaikuAnswerGenerator('test-key').generate(prompt),
    ).resolves.toBe('1文目\n2文目');
  });

  it('keeps the generation within the worker Lambda timeout budget', async () => {
    createHaikuAnswerGenerator('test-key');

    // SDK既定のリトライ(2回)が残っていると最悪60秒かかり、検索の15秒と合わせて
    // Lambdaの60秒タイムアウトを超える。超えるとcatch節に入れずユーザーが無応答になる
    expect(constructClient).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 20_000, maxRetries: 0 }),
    );
  });

  it('throws when the response carries no text block', async () => {
    createMessage.mockResolvedValue({ content: [] });

    await expect(
      createHaikuAnswerGenerator('test-key').generate(prompt),
    ).rejects.toThrow('回答本文');
  });
});
