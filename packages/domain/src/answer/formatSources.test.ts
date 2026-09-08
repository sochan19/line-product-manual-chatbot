import { describe, expect, it } from 'vitest';
import type { ManualChunk } from '../manualChunk.js';
import { formatSources } from './formatSources.js';

/** 出典の組み立てに関係する項目(ファイル名・本文)だけを差し替えてチャンクを作る */
function chunk(overrides: Partial<ManualChunk> = {}): ManualChunk {
  return {
    fileName: 'manuals/操作手順.docx',
    text: '本文だけのチャンクです。',
    score: 0.8,
    ...overrides,
  };
}

// 検索でヒットしたチャンクから、LINEの返信に付ける出典の行(F-02)を組み立てる
describe('formatSources', () => {
  // ヒット0件のときはループに入らず空リストを返す(出典の見出し自体を出さないため)
  it('returns an empty list when there are no chunks', () => {
    expect(formatSources([])).toEqual([]);
  });

  // R2のフォルダ名 manuals/ が付いていないファイル名は、そのまま出典に使う
  it('keeps the file name as-is when it has no manuals/ prefix', () => {
    expect(formatSources([chunk({ fileName: '規程.docx' })])).toEqual([
      '規程.docx',
    ]);
  });

  // 基本形: manuals/ を落としたファイル名と、チャンク先頭の見出しをつなげる
  it('extracts a heading at the top of the chunk', () => {
    const chunks = [
      chunk({ text: '# パスワードの変更\n\n設定画面から変更します。' }),
    ];
    expect(formatSources(chunks)).toEqual(['操作手順.docx > パスワードの変更']);
  });

  // 設計書§3.4に合わせ、見出しとして扱うのは `#`〜`###` の3段階
  it('accepts headings from level 1 to level 3', () => {
    const chunks = [
      chunk({ fileName: 'manuals/a.docx', text: '# 見出し1' }),
      chunk({ fileName: 'manuals/b.docx', text: '## 見出し2' }),
      chunk({ fileName: 'manuals/c.docx', text: '### 見出し3' }),
    ];
    expect(formatSources(chunks)).toEqual([
      'a.docx > 見出し1',
      'b.docx > 見出し2',
      'c.docx > 見出し3',
    ]);
  });

  // 4段階以上の見出しと、`#` の直後に空白が無い行は見出しとみなさない
  it('does not treat a level 4 heading or a bare hash as a heading', () => {
    const chunks = [
      chunk({ fileName: 'manuals/a.docx', text: '#### 深すぎる見出し' }),
      chunk({ fileName: 'manuals/b.docx', text: '#見出しではない' }),
    ];
    expect(formatSources(chunks)).toEqual(['a.docx', 'b.docx']);
  });

  // チャンクが段落の途中から始まっても、先頭数行までなら見出しを拾う
  it('finds a heading that appears within the first few lines', () => {
    const chunks = [
      chunk({
        text: '前の段落の続きです。\n\n## 印刷設定\n用紙サイズを選びます。',
      }),
    ];
    expect(formatSources(chunks)).toEqual(['操作手順.docx > 印刷設定']);
  });

  // 先頭から離れた見出しは本文中の見出しの可能性が高いので拾わず、ファイル名だけにする
  it('falls back to the file name when the heading is too far from the top', () => {
    const chunks = [chunk({ text: '1行目\n2行目\n3行目\n# 遠い見出し' })];
    expect(formatSources(chunks)).toEqual(['操作手順.docx']);
  });

  // 見出しが1つも無いチャンクでも、出典としてファイル名は必ず出す
  it('falls back to the file name when the chunk has no heading', () => {
    expect(formatSources([chunk()])).toEqual(['操作手順.docx']);
  });

  // 同じ見出しの別チャンクが複数ヒットしても、出典の行は1つにまとめる
  it('merges chunks that point at the same source', () => {
    const chunks = [
      chunk({ text: '# 共通の見出し\n前半' }),
      chunk({ text: '# 共通の見出し\n後半' }),
    ];
    expect(formatSources(chunks)).toEqual(['操作手順.docx > 共通の見出し']);
  });

  // 同じファイルでも見出しが違えば別の出典として並べる
  it('lists each heading separately within the same file', () => {
    const chunks = [
      chunk({ text: '# 見出しA\n本文' }),
      chunk({ text: '# 見出しB\n本文' }),
    ];
    expect(formatSources(chunks)).toEqual([
      '操作手順.docx > 見出しA',
      '操作手順.docx > 見出しB',
    ]);
  });
});
