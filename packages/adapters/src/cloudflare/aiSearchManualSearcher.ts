import type { ManualChunk, ManualSearcher } from '@line-manual-bot/domain';
import { parseAiSearchResponse } from './parseAiSearchResponse.js';

/** worker Lambdaのタイムアウト(30秒)の中で、生成にも時間を残せる長さ */
const searchTimeoutMs = 10_000;

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

export function createAiSearchManualSearcher(
  config: AiSearchConfig,
): ManualSearcher {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai-search/instances/${config.instanceName}/search`;

  return {
    async search(question) {
      const startedAt = Date.now();

      // リクエストはOpenAI互換のmessages形式。単純なqueryではない(docs/env-setup-record.md §7-1)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: question }],
        }),
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
