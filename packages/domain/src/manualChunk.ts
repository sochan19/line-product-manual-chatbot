/** AI Searchが返す、マニュアルを検索しやすく分割した断片1つ分 */
export type ManualChunk = {
  /** チャンクの由来ファイル(R2のオブジェクトキー。例: manuals/操作手順.md) */
  fileName: string;
  /** チャンク本文(Markdownのマニュアルを分割したもの) */
  text: string;
  /** 質問との関連度。1に近いほど関連が強い(P2でこのスコアを閾値判定に使う) */
  score: number;
};
