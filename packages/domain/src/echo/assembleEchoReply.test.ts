import { describe, expect, it } from 'vitest';
import { assembleEchoReply } from './assembleEchoReply.js';

describe('assembleEchoReply', () => {
  it('returns the received text unchanged', () => {
    expect(assembleEchoReply('こんにちは')).toBe('こんにちは');
  });

  it('preserves an empty string', () => {
    expect(assembleEchoReply('')).toBe('');
  });

  it('preserves whitespace and newlines', () => {
    const text = '1行目\n2行目  ';
    expect(assembleEchoReply(text)).toBe(text);
  });
});
