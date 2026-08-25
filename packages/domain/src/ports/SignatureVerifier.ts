export type SignatureVerifier = {
  verify(rawBody: string, signatureHeader: string | undefined): boolean;
};
