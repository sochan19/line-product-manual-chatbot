import type { ManualChunk } from '@line-manual-bot/domain';

type JsonObject = Record<string, unknown>;

/** 外部から来たJSONの値が、キーを引けるオブジェクトかどうかを判定する(配列とnullは除く) */
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
 * `content` 配列の各要素を1チャンクとして取り出す。
 * AI Searchのレスポンスは「ファイル単位」で、1ファイルの中に複数のヒットチャンクが
 * `content: [{ text, score }, ...]` として入る(2026-09-06実測)。
 * 結合して1件にまとめるとチャンクごとのスコアが失われ、P2のスコア足切りができなくなるため、
 * ここで1チャンク=1件に展開する。scoreが無い要素はファイルレベルのscoreで補う。
 */
function readContentChunks(
  entry: JsonObject,
  fileName: string,
  fileScore: number,
): ManualChunk[] {
  if (!Array.isArray(entry.content)) return [];

  return entry.content.filter(isJsonObject).flatMap((part) => {
    if (typeof part.text !== 'string') return [];
    return [
      {
        fileName,
        text: part.text,
        score: typeof part.score === 'number' ? part.score : fileScore,
      },
    ];
  });
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

  return result.data.flatMap((entry) => {
    if (!isJsonObject(entry)) {
      throw new Error('AI Searchのチャンクがオブジェクトではありません');
    }

    const fileName = readFileName(entry);
    const { score } = entry;

    if (fileName === undefined) {
      throw new Error('AI Searchのチャンクからファイル名を取り出せません');
    }
    if (typeof score !== 'number') {
      throw new Error('AI Searchのチャンクにスコアがありません');
    }

    // 本文を `text` で直接返す形と、`content` 配列で返す形の両方が確認されている
    if (typeof entry.text === 'string') {
      return [{ fileName, text: entry.text, score }];
    }

    const chunks = readContentChunks(entry, fileName, score);
    if (chunks.length === 0) {
      throw new Error('AI Searchのチャンクから本文を取り出せません');
    }
    return chunks;
  });
}
