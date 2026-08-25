import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLineSignatureVerifier } from './lineSignatureVerifier.js';

const channelSecret = 'test-channel-secret';

function signBody(body: string): string {
  return createHmac('sha256', channelSecret).update(body).digest('base64');
}

describe('createLineSignatureVerifier', () => {
  const verifier = createLineSignatureVerifier(channelSecret);

  it('accepts a request with a valid signature', () => {
    const body = '{"events":[]}';
    expect(verifier.verify(body, signBody(body))).toBe(true);
  });

  it('rejects a request whose body was tampered with after signing', () => {
    const originalBody = '{"events":[]}';
    const tamperedBody = '{"events":[{"tampered":true}]}';
    expect(verifier.verify(tamperedBody, signBody(originalBody))).toBe(false);
  });

  it('rejects a request with a missing signature header', () => {
    expect(verifier.verify('{"events":[]}', undefined)).toBe(false);
  });
});
