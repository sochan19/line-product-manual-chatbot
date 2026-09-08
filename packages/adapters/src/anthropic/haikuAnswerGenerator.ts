import Anthropic from '@anthropic-ai/sdk';
import type { AnswerGenerator } from '@line-manual-bot/domain';

/** 設計書§4で選定したモデル。JSON構造化出力の安定性と指示追従の厳密さで選んでいる */
const answerModel = 'claude-haiku-4-5';

/** LINEのメッセージとして読める長さの回答に収める上限 */
const maxAnswerTokens = 1024;

/** worker Lambdaのタイムアウト(60秒)内に検索(15秒)と合わせて収まる長さ */
const generateTimeoutMs = 20_000;

/**
 * SDKの自動リトライを止める(既定は2回)。
 * timeoutはリクエスト1回あたりなので、既定のままだと最悪 20秒 × 3回 = 60秒かかり、
 * 検索の15秒と合わせてworker Lambdaの60秒タイムアウトを超える。そうなるとLambdaごと
 * 落ちてcatch節に入らず、ユーザーへエラーの返信すら届かない(無応答)。
 * 一時的な失敗は定型返信+SQSリトライで拾う方が安全側(CLAUDE.mdの安全原則)。
 */
const generateRetryCount = 0;

/** Claude Haikuで回答本文を作るAnswerGenerator(生成ポートの実装)を作る */
export function createHaikuAnswerGenerator(apiKey: string): AnswerGenerator {
  const client = new Anthropic({
    apiKey,
    timeout: generateTimeoutMs,
    maxRetries: generateRetryCount,
  });

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
