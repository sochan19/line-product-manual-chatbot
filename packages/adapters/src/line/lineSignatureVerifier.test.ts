import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLineSignatureVerifier } from './lineSignatureVerifier.js';

const channelSecret = 'test-channel-secret';

/** LINEプラットフォームと同じ手順(チャネルシークレットでHMAC-SHA256)で署名を作る */
function signBody(body: string): string {
  return createHmac('sha256', channelSecret).update(body).digest('base64');
}

// LINEからのWebhookが本物か(改ざん・なりすましでないか)を署名で検証する
describe('createLineSignatureVerifier', () => {
  const verifier = createLineSignatureVerifier(channelSecret);

  // 署名ヘッダーが無いリクエストは、検証にかける前に弾く(入口のガード節)
  it('rejects a request with a missing signature header', () => {
    expect(verifier.verify('{"events":[]}', undefined)).toBe(false);
  });

  // 正しい署名が付いたリクエストは通す
  it('accepts a request with a valid signature', () => {
    const body = '{"events":[]}';
    expect(verifier.verify(body, signBody(body))).toBe(true);
  });

  // 署名後にボディを差し替えたリクエストは弾く(なりすまし対策の本命)
  it('rejects a request whose body was tampered with after signing', () => {
    const originalBody = '{"events":[]}';
    const tamperedBody = '{"events":[{"tampered":true}]}';
    expect(verifier.verify(tamperedBody, signBody(originalBody))).toBe(false);
  });
});
