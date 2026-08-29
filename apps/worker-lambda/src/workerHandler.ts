import {
  answerUnavailableReplyText,
  assembleAnswerReply,
  buildAnswerPrompt,
  noManualHitReplyText,
} from '@line-manual-bot/domain';
import type {
  AnswerGenerator,
  IncomingTextMessage,
  ManualSearcher,
  ReplySender,
} from '@line-manual-bot/domain';

export type WorkerHandlerDeps = {
  manualSearcher: ManualSearcher;
  answerGenerator: AnswerGenerator;
  replySender: ReplySender;
};

/**
 * 検索・生成に失敗したことをユーザーへ知らせる。
 * この返信自体が失敗しても、元のエラーを握りつぶさないようログだけ残す。
 */
async function replyUnavailable(
  deps: WorkerHandlerDeps,
  replyToken: string,
): Promise<void> {
  try {
    await deps.replySender.reply(replyToken, answerUnavailableReplyText);
  } catch (replyError) {
    console.error('エラー通知の返信にも失敗しました', replyError);
  }
}

export function createWorkerHandler(deps: WorkerHandlerDeps) {
  return async function handleMessage(
    message: IncomingTextMessage,
  ): Promise<void> {
    let replyText: string;

    try {
      const chunks = await deps.manualSearcher.search(message.text);

      // 未回答判定(スコア閾値・LLMの自己判定)とエスカレーションはP2スコープ
      if (chunks.length === 0) {
        await deps.replySender.reply(message.replyToken, noManualHitReplyText);
        return;
      }

      const answerText = await deps.answerGenerator.generate(
        buildAnswerPrompt(message.text, chunks),
      );
      replyText = assembleAnswerReply(answerText, chunks);
    } catch (error) {
      // 定型メッセージで即時に知らせた上で例外を投げ、SQSのリトライ → DLQ隔離に載せる
      // (replyTokenは短時間で失効するため、リトライでは返信できない。specs/p1-rag-mvp/spec.md)
      console.error('回答の準備に失敗しました', {
        webhookEventId: message.webhookEventId,
        error,
      });
      await replyUnavailable(deps, message.replyToken);
      throw error;
    }

    await deps.replySender.reply(message.replyToken, replyText);
  };
}
