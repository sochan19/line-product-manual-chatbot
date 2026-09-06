import { describe, expect, it } from 'vitest';
import { parseAiSearchResponse } from './parseAiSearchResponse.js';

describe('parseAiSearchResponse', () => {
  it('parses a response that carries the text and the file key on the chunk', () => {
    const payload = {
      success: true,
      errors: [],
      result: {
        data: [
          {
            id: 'chunk-001',
            type: 'text',
            score: 0.85,
            text: '# パスワードの変更\n設定画面から変更します。',
            item: { key: 'manuals/操作手順.docx', timestamp: 1775925540000 },
          },
        ],
      },
    };

    expect(parseAiSearchResponse(payload)).toEqual([
      {
        fileName: 'manuals/操作手順.docx',
        text: '# パスワードの変更\n設定画面から変更します。',
        score: 0.85,
      },
    ]);
  });

  // AI Searchの実レスポンスはファイル単位で、1ファイルに複数のヒットチャンクが入る。
  // 結合するとチャンクごとのスコアが失われP2の足切りができないため、1件ずつに展開する
  it('expands each content entry into its own chunk with its own score', () => {
    const payload = {
      success: true,
      result: {
        data: [
          {
            file_id: 'file-1',
            filename: 'manuals/取扱説明書.md',
            score: 0.596,
            content: [
              {
                id: 'c1',
                type: 'text',
                text: '### ろ過フィルター',
                score: 0.596,
              },
              {
                id: 'c2',
                type: 'text',
                text: '# 部品の交換頻度',
                score: 0.474,
              },
            ],
          },
        ],
      },
    };

    expect(parseAiSearchResponse(payload)).toEqual([
      {
        fileName: 'manuals/取扱説明書.md',
        text: '### ろ過フィルター',
        score: 0.596,
      },
      {
        fileName: 'manuals/取扱説明書.md',
        text: '# 部品の交換頻度',
        score: 0.474,
      },
    ]);
  });

  it('falls back to the file score when a content entry has none', () => {
    const payload = {
      success: true,
      result: {
        data: [
          {
            filename: 'manuals/規程.md',
            score: 0.42,
            content: [{ type: 'text', text: '本文' }],
          },
        ],
      },
    };

    expect(parseAiSearchResponse(payload)).toEqual([
      { fileName: 'manuals/規程.md', text: '本文', score: 0.42 },
    ]);
  });

  it('keeps the chunks of every hit file', () => {
    const payload = {
      success: true,
      result: {
        data: [
          {
            filename: 'manuals/a.md',
            score: 0.6,
            content: [{ type: 'text', text: 'Aの本文', score: 0.6 }],
          },
          {
            filename: 'manuals/b.md',
            score: 0.5,
            content: [{ type: 'text', text: 'Bの本文', score: 0.5 }],
          },
        ],
      },
    };

    expect(parseAiSearchResponse(payload)).toEqual([
      { fileName: 'manuals/a.md', text: 'Aの本文', score: 0.6 },
      { fileName: 'manuals/b.md', text: 'Bの本文', score: 0.5 },
    ]);
  });

  it('returns an empty list when nothing hit', () => {
    expect(
      parseAiSearchResponse({ success: true, result: { data: [] } }),
    ).toEqual([]);
  });

  it('throws with the error message of a failed response', () => {
    const payload = {
      success: false,
      errors: [{ code: 10000, message: 'Authentication error' }],
      result: null,
    };

    expect(() => parseAiSearchResponse(payload)).toThrow(
      'Authentication error',
    );
  });

  it('throws when the payload has no result.data', () => {
    expect(() => parseAiSearchResponse({ success: true })).toThrow(
      'result.data',
    );
  });

  it('throws when a chunk has neither text nor content', () => {
    const payload = {
      success: true,
      result: { data: [{ score: 0.5, item: { key: 'manuals/a.docx' } }] },
    };

    expect(() => parseAiSearchResponse(payload)).toThrow('本文');
  });

  it('throws when a chunk has no score', () => {
    const payload = {
      success: true,
      result: { data: [{ text: '本文', item: { key: 'manuals/a.docx' } }] },
    };

    expect(() => parseAiSearchResponse(payload)).toThrow('スコア');
  });

  it('throws when the payload is not an object', () => {
    expect(() => parseAiSearchResponse('検索結果')).toThrow(
      'オブジェクトではありません',
    );
  });
});
