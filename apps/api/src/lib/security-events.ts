// One place for security event names. Logs, tests and the alarms of week 21
// all depend on these exact strings.
export const SecurityEvent = {
  AuthorizationDenied: "authorization_denied",
  OriginRejected: "origin_rejected",
  RateLimited: "rate_limited",
  RateLimitStoreError: "rate_limit_store_error",
  RefreshTokenReuse: "refresh_token_reuse",
  InvitationInvalid: "invitation_invalid",
} as const;

export type SecurityEventName = (typeof SecurityEvent)[keyof typeof SecurityEvent];
