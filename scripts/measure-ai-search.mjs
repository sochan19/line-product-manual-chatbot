#!/usr/bin/env node
// AI Searchのレイテンシ・検索スコア・見出しメタデータの有無を実測する(P1の実測タスク)。
//
// 使い方(ローカルでAWS認証情報を設定した上で実行する):
//   node scripts/measure-ai-search.mjs "パスワードの変え方は?" "印刷の設定はどこ?"
//   node scripts/measure-ai-search.mjs --raw "質問"   # 生のレスポンスJSONも表示する
//
// 必要な権限: SSMの /line-manual-bot/cloudflare/* を読めること
// P4の評価セット・θ1キャリブレーションでもそのまま再利用する。

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const awsRegion = process.env.AWS_REGION ?? 'ap-northeast-1';
const accountIdParameterName = '/line-manual-bot/cloudflare/account-id';
const aiSearchTokenParameterName =
  '/line-manual-bot/cloudflare/ai-search-token';
const aiSearchInstanceName = 'line-manual-bot';

// packages/domain/src/answer/formatSources.ts と同じ判定。実測用に最小限だけ写している
const headingSearchLineCount = 3;
const headingPattern = /^#{1,3}[ \t]+(.+)$/;

const ssmClient = new SSMClient({ region: awsRegion });

async function getSsmParameter(parameterName) {
  const result = await ssmClient.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  const value = result.Parameter?.Value;
  if (!value)
    throw new Error(`SSMパラメータが見つかりません: ${parameterName}`);
  return value;
}

function extractHeading(chunkText) {
  let checkedLineCount = 0;
  for (const line of String(chunkText ?? '').split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') continue;
    const heading = headingPattern.exec(trimmedLine)?.[1]?.trim();
    if (heading) return heading;
    checkedLineCount += 1;
    if (checkedLineCount >= headingSearchLineCount) break;
  }
  return undefined;
}

/** アダプタと同じく、本文とファイル名の2つの返却形の両方に対応する */
function readChunk(entry) {
  const text =
    typeof entry.text === 'string'
      ? entry.text
      : (entry.content ?? [])
          .map((part) => part?.text)
          .filter((part) => typeof part === 'string')
          .join('\n');
  const fileName = entry.item?.key ?? entry.filename ?? '(不明)';
  return { fileName, text, score: entry.score };
}

async function search(endpoint, apiToken, question) {
  const startedAt = Date.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    // アダプタと同じ形。ボディは {"query": ...}(docs/env-setup-record.md §7-1)
    body: JSON.stringify({ query: question }),
  });
  const latencyMs = Date.now() - startedAt;
  const payload = await response.json();

  if (!response.ok || payload.success === false) {
    throw new Error(
      `AI Searchの呼び出しに失敗しました (HTTP ${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return { latencyMs, payload };
}

async function main() {
  const args = process.argv.slice(2);
  const showsRawResponse = args.includes('--raw');
  const questions = args.filter((arg) => arg !== '--raw');

  if (questions.length === 0) {
    console.error(
      '質問を1つ以上指定してください: node scripts/measure-ai-search.mjs "質問"',
    );
    process.exitCode = 1;
    return;
  }

  const [accountId, apiToken] = await Promise.all([
    getSsmParameter(accountIdParameterName),
    getSsmParameter(aiSearchTokenParameterName),
  ]);
  // 検索系APIのパスは旧名の autorag/rags のまま(docs/env-setup-record.md §7-1)
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/autorag/rags/${aiSearchInstanceName}/search`;

  const latencies = [];

  for (const question of questions) {
    const { latencyMs, payload } = await search(endpoint, apiToken, question);
    latencies.push(latencyMs);

    const chunks = (payload.result?.data ?? []).map(readChunk);
    console.log(`\n質問: ${question}`);
    console.log(`  レイテンシ: ${latencyMs} ms / ヒット数: ${chunks.length}`);

    chunks.forEach((chunk, index) => {
      const heading = extractHeading(chunk.text);
      console.log(
        `  [${index + 1}] score=${chunk.score} file=${chunk.fileName} 見出し=${heading ?? '(取得できず)'}`,
      );
      console.log(
        `      本文冒頭: ${chunk.text.slice(0, 60).replace(/\n/g, ' ')}`,
      );
    });

    if (showsRawResponse) {
      console.log('  生のレスポンス:');
      console.log(JSON.stringify(payload, null, 2));
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  console.log('\n--- レイテンシまとめ ---');
  console.log(`  件数: ${sorted.length}`);
  console.log(`  最小: ${sorted[0]} ms`);
  console.log(`  中央: ${sorted[Math.floor(sorted.length / 2)]} ms`);
  console.log(`  最大: ${sorted[sorted.length - 1]} ms`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
