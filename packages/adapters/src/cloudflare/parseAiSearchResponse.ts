import type { ManualChunk } from '@line-manual-bot/domain';

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** エラー応答(`success: false`)に入るメッセージを読めるだけ読む */
function readErrorMessages(payload: JsonObject): string {
  if (!Array.isArray(payload.errors)) return '詳細不明';

  const messages = payload.errors
    .filter(isJsonObject)
    .map((error) => (typeof error.message === 'string' ? error.message : ''))
    .filter((message) => message !== '');

  return messages.length > 0 ? messages.join(' / ') : '詳細不明';
}

/**
 * チャンク本文を取り出す。AI Searchは本文を `text` で返す形と、
 * OpenAI互換の `content` 配列で返す形の両方が確認されているため、どちらも受け付ける。
 */
function readChunkText(entry: JsonObject): string | undefined {
  if (typeof entry.text === 'string') return entry.text;

  if (Array.isArray(entry.content)) {
    const texts = entry.content
      .filter(isJsonObject)
      .map((part) => part.text)
      .filter((text): text is string => typeof text === 'string');
    if (texts.length > 0) return texts.join('\n');
  }

  return undefined;
}

/** チャンクの由来ファイル名。`item.key` で返す形と `filename` で返す形の両方を受け付ける */
function readFileName(entry: JsonObject): string | undefined {
  if (isJsonObject(entry.item) && typeof entry.item.key === 'string') {
    return entry.item.key;
  }
  if (typeof entry.filename === 'string') return entry.filename;

  return undefined;
}

/**
 * AI Searchの `/search` レスポンスをドメインのManualChunkに変換する。
 * 読み取れない形は誤った回答の元になるため、握りつぶさず例外にする(安全側に倒す)。
 */
export function parseAiSearchResponse(payload: unknown): ManualChunk[] {
  if (!isJsonObject(payload)) {
    throw new Error('AI Searchのレスポンスがオブジェクトではありません');
  }

  if (payload.success === false) {
    throw new Error(
      `AI Searchがエラーを返しました: ${readErrorMessages(payload)}`,
    );
  }

  const result = payload.result;
  if (!isJsonObject(result) || !Array.isArray(result.data)) {
    throw new Error('AI Searchのレスポンスに result.data がありません');
  }

  return result.data.map((entry) => {
    if (!isJsonObject(entry)) {
      throw new Error('AI Searchのチャンクがオブジェクトではありません');
    }

    const fileName = readFileName(entry);
    const text = readChunkText(entry);
    const { score } = entry;

    if (fileName === undefined || text === undefined) {
      throw new Error(
        'AI Searchのチャンクからファイル名または本文を取り出せません',
      );
    }
    if (typeof score !== 'number') {
      throw new Error('AI Searchのチャンクにスコアがありません');
    }

    return { fileName, text, score };
  });
}
