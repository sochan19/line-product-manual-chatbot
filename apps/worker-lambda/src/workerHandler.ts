import { assembleEchoReply } from '@line-manual-bot/domain';
import type { IncomingTextMessage, ReplySender } from '@line-manual-bot/domain';

export type WorkerHandlerDeps = {
  replySender: ReplySender;
};

export function createWorkerHandler(deps: WorkerHandlerDeps) {
  return async function handleMessage(
    message: IncomingTextMessage,
  ): Promise<void> {
    const replyText = assembleEchoReply(message.text);
    await deps.replySender.reply(message.replyToken, replyText);
  };
}
