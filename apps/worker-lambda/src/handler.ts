import {
  createAiSearchManualSearcher,
  createHaikuAnswerGenerator,
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
const anthropicApiKeyParameterName = mustGetEnv(
  'ANTHROPIC_API_KEY_PARAMETER_NAME',
);
const aiSearchTokenParameterName = mustGetEnv(
  'CLOUDFLARE_AI_SEARCH_TOKEN_PARAMETER_NAME',
);
const cloudflareAccountIdParameterName = mustGetEnv(
  'CLOUDFLARE_ACCOUNT_ID_PARAMETER_NAME',
);
const aiSearchInstanceName = mustGetEnv('AI_SEARCH_INSTANCE_NAME');

// コールドスタート時に一度だけSSMから取得し、以降のウォームスタートでは再利用する
let handleMessagePromise: ReturnType<typeof buildWorkerHandler> | undefined;

async function buildWorkerHandler() {
  const [channelAccessToken, anthropicApiKey, aiSearchToken, accountId] =
    await Promise.all([
      getSsmParameter(channelAccessTokenParameterName),
      getSsmParameter(anthropicApiKeyParameterName),
      getSsmParameter(aiSearchTokenParameterName),
      getSsmParameter(cloudflareAccountIdParameterName),
    ]);

  return createWorkerHandler({
    manualSearcher: createAiSearchManualSearcher({
      accountId,
      instanceName: aiSearchInstanceName,
      apiToken: aiSearchToken,
    }),
    answerGenerator: createHaikuAnswerGenerator(anthropicApiKey),
    replySender: createLineReplySender(channelAccessToken),
  });
}

async function getHandleMessage() {
  if (handleMessagePromise === undefined) {
    handleMessagePromise = buildWorkerHandler();
  }

  try {
    return await handleMessagePromise;
  } catch (error) {
    handleMessagePromise = undefined; // 次回の呼び出しで再試行できるようにする
    throw error;
  }
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  const handleMessage = await getHandleMessage();

  for (const record of event.Records) {
    const message = JSON.parse(record.body) as IncomingTextMessage;
    await handleMessage(message);
  }
};
