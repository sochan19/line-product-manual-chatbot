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

  it('parses the OpenAI-compatible shape with filename and a content array', () => {
    const payload = {
      success: true,
      result: {
        data: [
          {
            file_id: 'file-1',
            filename: 'manuals/規程.docx',
            score: 0.42,
            content: [
              { type: 'text', text: '前半の本文' },
              { type: 'text', text: '後半の本文' },
            ],
          },
        ],
      },
    };

    expect(parseAiSearchResponse(payload)).toEqual([
      {
        fileName: 'manuals/規程.docx',
        text: '前半の本文\n後半の本文',
        score: 0.42,
      },
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
