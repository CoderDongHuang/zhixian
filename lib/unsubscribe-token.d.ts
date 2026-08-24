export type UnsubscribeClaims = { v: 1; purpose: "unsubscribe"; sub: string; iat: number; exp: number };
export const UNSUBSCRIBE_TOKEN_TTL_MS: number;
export function issueUnsubscribeToken(userId: string, now?: number, ttlMs?: number): string;
export function verifyUnsubscribeToken(token: string, expectedUserId: string, now?: number): UnsubscribeClaims | null;
