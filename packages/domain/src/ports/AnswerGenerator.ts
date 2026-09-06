/** LLMに渡す指示文。組み立てはドメイン層が行い、アダプタは送信するだけにする(F-01) */
export type AnswerPrompt = {
  /** 役割と制約(マニュアルの抜粋だけを根拠にする等)の指示 */
  systemPrompt: string;
  /** 検索でヒットしたチャンクと質問文 */
  userPrompt: string;
};

export type AnswerGenerator = {
  /** プロンプトに含まれる情報だけを根拠に、回答本文を生成する(出典はコード側で組み立てるため含めない) */
  generate(prompt: AnswerPrompt): Promise<string>;
};
