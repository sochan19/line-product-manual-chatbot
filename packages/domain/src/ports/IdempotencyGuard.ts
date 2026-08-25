export type IdempotencyGuard = {
  /** Records the event id if it hasn't been seen before. Returns false when it's a duplicate. */
  claimEvent(webhookEventId: string): Promise<boolean>;
};
