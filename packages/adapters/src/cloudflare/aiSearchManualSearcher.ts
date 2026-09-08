import type { ManualChunk, ManualSearcher } from '@line-manual-bot/domain';
import { parseAiSearchResponse } from './parseAiSearchResponse.js';

/**
 * worker Lambdaのタイムアウト(60秒)の中で、生成にも時間を残せる長さ。
 * P1の実測ではレイテンシは中央4.7秒・最大8.7秒だった(specs/p1-rag-mvp/spec.md)
 */
const searchTimeoutMs = 15_000;

export type AiSearchConfig = {
  accountId: string;
  /** Cloudflareダッシュボードで作成したAI Searchインスタンス名 */
  instanceName: string;
  /** AI Searchの「編集」権限を持つAPIトークン(読み取り権限では/searchを呼べない) */
  apiToken: string;
};

/** 実測(レイテンシ・スコア)をP1の目的として残すため、検索のたびに1行ログを出す */
function logSearchResult(latencyMs: number, chunks: ManualChunk[]): void {
  console.log(
    JSON.stringify({
      event: 'aiSearchCompleted',
      latencyMs,
      hitCount: chunks.length,
      scores: chunks.map((chunk) => chunk.score),
      fileNames: chunks.map((chunk) => chunk.fileName),
    }),
  );
}

/** AI Searchの /search を呼ぶManualSearcher(検索ポートの実装)を作る */
export function createAiSearchManualSearcher(
  config: AiSearchConfig,
): ManualSearcher {
  // 製品名は「AI Search」だが、検索系APIのパスは旧名の autorag/rags のまま。
  // ai-search/instances/{名前}/search は存在せず401(ルート不在)になる(docs/env-setup-record.md §7-1)
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/autorag/rags/${config.instanceName}/search`;

  return {
    async search(question) {
      const startedAt = Date.now();

      // ボディは {"query": "質問文"}。messages配列を送ると400になる(同§7-1)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: question }),
        signal: AbortSignal.timeout(searchTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(
          `AI Searchの呼び出しに失敗しました (HTTP ${response.status}): ${await response.text()}`,
        );
      }

      const chunks = parseAiSearchResponse(await response.json());
      logSearchResult(Date.now() - startedAt, chunks);
      return chunks;
    },
  };
}
