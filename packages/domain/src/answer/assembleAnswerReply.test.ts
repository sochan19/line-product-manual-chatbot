import { describe, expect, it } from 'vitest';
import type { ManualChunk } from '../manualChunk.js';
import { assembleAnswerReply } from './assembleAnswerReply.js';

const chunk: ManualChunk = {
  fileName: 'manuals/操作手順.docx',
  text: '# パスワードの変更\n設定画面から変更します。',
  score: 0.9,
};

// LLMが生成した回答本文に出典を付けて、LINEへ送る1通のメッセージに仕上げる
describe('assembleAnswerReply', () => {
  // LLMの出力に前後の空白や改行が混ざっても、返信は本文だけにそろえる
  it('trims surrounding whitespace of the generated answer', () => {
    expect(assembleAnswerReply('  回答本文\n\n', [])).toBe('回答本文');
  });

  // 出典が1つも取れないときは「出典:」の見出しごと省き、回答だけを返す
  it('returns the answer alone when there is no source', () => {
    expect(assembleAnswerReply('回答本文', [])).toBe('回答本文');
  });

  // 出典は回答の下に、空行をはさんで箇条書きで並べる(F-02)
  it('puts the sources under the answer', () => {
    expect(assembleAnswerReply('設定画面から変更できます。', [chunk])).toBe(
      '設定画面から変更できます。\n\n出典:\n- 操作手順.docx > パスワードの変更',
    );
  });

  // 複数のチャンクがヒットしたときは、その分だけ出典の行を並べる
  it('lists every source when several chunks hit', () => {
    const another: ManualChunk = {
      fileName: 'manuals/規程.docx',
      text: '90日ごとに変更してください。',
      score: 0.7,
    };

    expect(
      assembleAnswerReply('90日ごとに変更します。', [chunk, another]),
    ).toBe(
      '90日ごとに変更します。\n\n出典:\n- 操作手順.docx > パスワードの変更\n- 規程.docx',
    );
  });
});
