import type { ManualChunk } from '../manualChunk.js';

export type ManualSearcher = {
  /** 質問文に関連するチャンクを、関連度の高い順に返す */
  search(question: string): Promise<ManualChunk[]>;
};
