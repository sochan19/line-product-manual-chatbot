export type ReplySender = {
  reply(replyToken: string, text: string): Promise<void>;
};
