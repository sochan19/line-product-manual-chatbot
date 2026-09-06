import {
  createDynamoIdempotencyGuard,
  createLineSignatureVerifier,
  createSqsOutboundQueue,
  getSsmParameter,
} from '@line-manual-bot/adapters';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  type WebhookHandlerInput,
  createWebhookHandler,
} from './webhookHandler.js';

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数が未設定です: ${name}`);
  }
  return value;
}

const idempotencyTableName = mustGetEnv('IDEMPOTENCY_TABLE_NAME');
const outboundQueueUrl = mustGetEnv('OUTBOUND_QUEUE_URL');
const channelSecretParameterName = mustGetEnv(
  'LINE_CHANNEL_SECRET_PARAMETER_NAME',
);

// コールドスタート時に一度だけSSMから取得し、以降のウォームスタートでは再利用する
let handleWebhookPromise: ReturnType<typeof buildWebhookHandler> | undefined;

async function buildWebhookHandler() {
  const channelSecret = await getSsmParameter(channelSecretParameterName);
  return createWebhookHandler({
    signatureVerifier: createLineSignatureVerifier(channelSecret),
    idempotencyGuard: createDynamoIdempotencyGuard(idempotencyTableName),
    outboundQueue: createSqsOutboundQueue(outboundQueueUrl),
  });
}

async function getHandleWebhook() {
  if (handleWebhookPromise === undefined) {
    handleWebhookPromise = buildWebhookHandler();
  }

  try {
    return await handleWebhookPromise;
  } catch (error) {
    handleWebhookPromise = undefined; // 次回の呼び出しで再試行できるようにする
    throw error;
  }
}

function getRawBody(event: APIGatewayProxyEventV2): string {
  if (!event.body) {
    return '';
  }
  return event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body;
}

function getSignatureHeader(
  event: APIGatewayProxyEventV2,
): WebhookHandlerInput['signatureHeader'] {
  const headers = event.headers ?? {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'x-line-signature') {
      return value;
    }
  }
  return undefined;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const handleWebhook = await getHandleWebhook();

  const result = await handleWebhook({
    rawBody: getRawBody(event),
    signatureHeader: getSignatureHeader(event),
  });

  return { statusCode: result.statusCode };
}
