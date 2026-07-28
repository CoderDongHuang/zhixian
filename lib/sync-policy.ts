export function shouldApplyChange(existingChangedAt: Date | null, incomingChangedAt: Date) {
  return !existingChangedAt || existingChangedAt <= incomingChangedAt;
}

export function isSessionDeviceAllowed<T extends { deviceId: string; revokedAt: Date | null; expiresAt: Date }>(session: T | null, deviceId: string, now = new Date()): session is T {
  return Boolean(session && session.deviceId === deviceId && !session.revokedAt && session.expiresAt > now);
}

export function validIdempotencyKey(value: string) {
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value);
}
