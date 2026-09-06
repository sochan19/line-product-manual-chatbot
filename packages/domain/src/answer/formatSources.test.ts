import { describe, expect, it } from 'vitest';
import type { ManualChunk } from '../manualChunk.js';
import { formatSources } from './formatSources.js';

function chunk(overrides: Partial<ManualChunk> = {}): ManualChunk {
  return {
    fileName: 'manuals/操作手順.docx',
    text: '本文だけのチャンクです。',
    score: 0.8,
    ...overrides,
  };
}

describe('formatSources', () => {
  it('extracts a heading at the top of the chunk', () => {
    const chunks = [
      chunk({ text: '# パスワードの変更\n\n設定画面から変更します。' }),
    ];
    expect(formatSources(chunks)).toEqual(['操作手順.docx > パスワードの変更']);
  });

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

  it('finds a heading that appears within the first few lines', () => {
    const chunks = [
      chunk({
        text: '前の段落の続きです。\n\n## 印刷設定\n用紙サイズを選びます。',
      }),
    ];
    expect(formatSources(chunks)).toEqual(['操作手順.docx > 印刷設定']);
  });

  it('falls back to the file name when the heading is too far from the top', () => {
    const chunks = [chunk({ text: '1行目\n2行目\n3行目\n# 遠い見出し' })];
    expect(formatSources(chunks)).toEqual(['操作手順.docx']);
  });

  it('falls back to the file name when the chunk has no heading', () => {
    expect(formatSources([chunk()])).toEqual(['操作手順.docx']);
  });

  it('does not treat a level 4 heading or a bare hash as a heading', () => {
    const chunks = [
      chunk({ fileName: 'manuals/a.docx', text: '#### 深すぎる見出し' }),
      chunk({ fileName: 'manuals/b.docx', text: '#見出しではない' }),
    ];
    expect(formatSources(chunks)).toEqual(['a.docx', 'b.docx']);
  });

  it('keeps the file name as-is when it has no manuals/ prefix', () => {
    expect(formatSources([chunk({ fileName: '規程.docx' })])).toEqual([
      '規程.docx',
    ]);
  });

  it('merges chunks that point at the same source', () => {
    const chunks = [
      chunk({ text: '# 共通の見出し\n前半' }),
      chunk({ text: '# 共通の見出し\n後半' }),
    ];
    expect(formatSources(chunks)).toEqual(['操作手順.docx > 共通の見出し']);
  });

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

  it('returns an empty list when there are no chunks', () => {
    expect(formatSources([])).toEqual([]);
  });
});
