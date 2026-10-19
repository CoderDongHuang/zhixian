import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 128 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string | null | undefined) {
  const [, salt, hex] = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded || "") || [];
  // Spend the same work for unknown users and accounts without a password.
  const actual = await derive(password, salt || "00000000000000000000000000000000");
  return timingSafeEqual(actual, Buffer.from(hex || "0".repeat(128), "hex")) && Boolean(salt);
}
