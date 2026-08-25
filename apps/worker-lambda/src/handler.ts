import {
  createLineReplySender,
  getSsmParameter,
} from '@line-manual-bot/adapters';
import type { IncomingTextMessage } from '@line-manual-bot/domain';
import type { SQSEvent, SQSHandler } from 'aws-lambda';
import { createWorkerHandler } from './workerHandler.js';

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数が未設定です: ${name}`);
  }
  return value;
}

const channelAccessTokenParameterName = mustGetEnv(
  'LINE_CHANNEL_ACCESS_TOKEN_PARAMETER_NAME',
);

// コールドスタート時に一度だけSSMから取得し、以降のウォームスタートでは再利用する
let handleMessagePromise: ReturnType<typeof buildWorkerHandler> | undefined;

async function buildWorkerHandler() {
  const channelAccessToken = await getSsmParameter(
    channelAccessTokenParameterName,
  );
  return createWorkerHandler({
    replySender: createLineReplySender(channelAccessToken),
  });
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  handleMessagePromise ??= buildWorkerHandler();
  const handleMessage = await handleMessagePromise;

  for (const record of event.Records) {
    const message = JSON.parse(record.body) as IncomingTextMessage;
    await handleMessage(message);
  }
};
