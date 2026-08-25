import type { IncomingTextMessage } from '../incomingTextMessage.js';

export type OutboundQueue = {
  enqueue(message: IncomingTextMessage): Promise<void>;
};
