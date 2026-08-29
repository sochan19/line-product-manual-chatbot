import Anthropic from '@anthropic-ai/sdk';
import type { AnswerGenerator } from '@line-manual-bot/domain';

/** 設計書§4で選定したモデル。JSON構造化出力の安定性と指示追従の厳密さで選んでいる */
const answerModel = 'claude-haiku-4-5';

/** LINEのメッセージとして読める長さの回答に収める上限 */
const maxAnswerTokens = 1024;

/** worker Lambdaのタイムアウト(30秒)内に検索と合わせて収まる長さ */
const generateTimeoutMs = 15_000;

export function createHaikuAnswerGenerator(apiKey: string): AnswerGenerator {
  const client = new Anthropic({ apiKey, timeout: generateTimeoutMs });

  return {
    async generate(prompt) {
      // ツールを一切渡さないことで、LLMが到達できる情報を検索ヒットに物理的に限定する(F-01 第0段)
      const message = await client.messages.create({
        model: answerModel,
        max_tokens: maxAnswerTokens,
        system: prompt.systemPrompt,
        messages: [{ role: 'user', content: prompt.userPrompt }],
      });

      const answerText = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      if (answerText === '') {
        throw new Error('LLMが回答本文を返しませんでした');
      }

      return answerText;
    },
  };
}
