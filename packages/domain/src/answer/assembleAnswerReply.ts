import type { ManualChunk } from '../manualChunk.js';
import { formatSources } from './formatSources.js';

/** 検索でヒットしたチャンクが0件だったときの返信(P2でエスカレーションに置き換える) */
export const noManualHitReplyText =
  'マニュアルには該当する記載が見つかりませんでした。お手数ですが、言い方を変えてもう一度お送りください。';

/** 検索・生成に失敗したときの返信(P2で§3.7のpush通知に置き換える) */
export const answerUnavailableReplyText =
  'ただいま回答を準備できませんでした。時間をおいて、もう一度お送りください。';

/** 回答本文に出典(F-02)を付けて、LINEに送る1通のメッセージにする */
export function assembleAnswerReply(
  answerText: string,
  chunks: ManualChunk[],
): string {
  const answer = answerText.trim();
  const sources = formatSources(chunks);

  if (sources.length === 0) {
    return answer;
  }

  const sourceLines = sources.map((source) => `- ${source}`).join('\n');
  return `${answer}\n\n出典:\n${sourceLines}`;
}
