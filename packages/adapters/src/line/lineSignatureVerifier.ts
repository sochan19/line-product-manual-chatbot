import type { SignatureVerifier } from '@line-manual-bot/domain';
import { validateSignature } from '@line/bot-sdk';

/** チャネルシークレットでLINEのWebhook署名を検証するSignatureVerifierを作る */
export function createLineSignatureVerifier(
  channelSecret: string,
): SignatureVerifier {
  return {
    verify(rawBody, signatureHeader) {
      if (!signatureHeader) {
        return false;
      }
      return validateSignature(rawBody, channelSecret, signatureHeader);
    },
  };
}
