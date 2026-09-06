import type { ManualChunk } from '../manualChunk.js';
import type { AnswerPrompt } from '../ports/AnswerGenerator.js';

/**
 * F-01(回答の根拠はマニュアルのみ)をプロンプト側から支える指示。
 * LLMにツールを一切渡さないこと(アダプタ側)と合わせて二重に担保する。
 */
const answerSystemPrompt = [
  'あなたは社内マニュアルの内容だけを根拠に質問へ答えるアシスタントです。',
  '次のルールを必ず守ってください。',
  '- 回答は、渡された「マニュアルの抜粋」に書かれている内容だけを根拠にする',
  '- 抜粋に書かれていないことは、一般的な知識として知っていても答えない',
  '- 抜粋だけでは答えられない場合は、答えられないことを1文で伝える',
  '- 出典やファイル名は書かない(システム側で回答に付け加えます)',
  '- 日本語で、LINEのメッセージとして読みやすい長さで答える',
].join('\n');

/**
 * 検索でヒットしたチャンクと質問文だけからプロンプトを組み立てる。
 * ファイル名も会話履歴も渡さないため、LLMが参照できる情報は抜粋の本文に限られる。
 */
export function buildAnswerPrompt(
  question: string,
  chunks: ManualChunk[],
): AnswerPrompt {
  const excerpts = chunks
    .map((chunk, index) => `[抜粋${index + 1}]\n${chunk.text}`)
    .join('\n\n');

  const userPrompt = [
    '以下はマニュアルの抜粋です。',
    '',
    excerpts,
    '',
    `質問: ${question}`,
  ].join('\n');

  return { systemPrompt: answerSystemPrompt, userPrompt };
}
