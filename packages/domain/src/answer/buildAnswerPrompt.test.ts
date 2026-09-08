import { describe, expect, it } from 'vitest';
import type { ManualChunk } from '../manualChunk.js';
import { buildAnswerPrompt } from './buildAnswerPrompt.js';

const chunks: ManualChunk[] = [
  {
    fileName: 'manuals/操作手順.docx',
    text: '# パスワードの変更\n設定画面から変更します。',
    score: 0.9,
  },
  {
    fileName: 'manuals/規程.docx',
    text: 'パスワードは90日ごとに変更してください。',
    score: 0.7,
  },
];

// 検索でヒットしたチャンクと質問文だけから、Claudeへ渡すプロンプトを組み立てる
describe('buildAnswerPrompt', () => {
  // 回答の材料(抜粋の本文)と質問が、もれなくユーザープロンプトに入ること
  it('includes every chunk text and the question', () => {
    const { userPrompt } = buildAnswerPrompt('パスワードの変え方は?', chunks);

    for (const chunk of chunks) {
      expect(userPrompt).toContain(chunk.text);
    }
    expect(userPrompt).toContain('パスワードの変え方は?');
  });

  // 抜粋と質問以外(ファイル名など)がLLMに渡らないこと。F-01をプロンプト側から担保する
  it('does not leak information other than the chunk texts and the question (F-01)', () => {
    const { userPrompt } = buildAnswerPrompt('パスワードの変え方は?', chunks);

    // ファイル名は出典としてコード側で付けるため、LLMには渡さない
    for (const chunk of chunks) {
      expect(userPrompt).not.toContain(chunk.fileName);
    }
    // 抜粋と質問以外の文字列が本文として混ざっていないことを、行単位で確認する
    const chunkLines = chunks.flatMap((chunk) => chunk.text.split('\n'));
    const promptLines = userPrompt
      .split('\n')
      .filter((line) => line !== '')
      .filter((line) => !line.startsWith('[抜粋'))
      .filter((line) => line !== '以下はマニュアルの抜粋です。')
      .filter((line) => !line.startsWith('質問: '));
    expect(promptLines).toEqual(chunkLines.filter((line) => line !== ''));
  });

  // システムプロンプトに、抜粋だけを根拠にする指示と出典を書かせない指示が入っていること
  it('tells the model to answer only from the excerpts and to omit sources', () => {
    const { systemPrompt } = buildAnswerPrompt('質問', chunks);

    expect(systemPrompt).toContain('抜粋');
    expect(systemPrompt).toContain('出典');
  });

  // システムプロンプトは固定文。質問やチャンクによって指示が薄まらないことを固定する
  it('keeps the system prompt independent of the question and chunks', () => {
    const first = buildAnswerPrompt('質問A', chunks);
    const second = buildAnswerPrompt('質問B', []);

    expect(first.systemPrompt).toBe(second.systemPrompt);
  });
});
