import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";

// New hashes use scrypt from Node's built-in crypto. Unlike bcryptjs (pure JS) it runs on the
// libuv thread pool, so a login attempt no longer stalls every other request on the process.
// Legacy bcrypt hashes keep verifying and are upgraded on the next successful sign-in.
const SCRYPT_PREFIX = "scrypt";
const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2;
const MIN_PASSWORD_LENGTH = 12;

export function normalizeLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePasswordStrength(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
}

function deriveKey(password: string, salt: Buffer, n: number, r: number, p: number, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password.normalize("NFKC"),
      salt,
      keyLength,
      { N: n, r, p, maxmem: Math.max(SCRYPT_MAXMEM, 256 * n * r) },
      (error, derived) => (error ? reject(error) : resolve(derived)),
    );
  });
}

async function scryptHash(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEYLEN);
  return [SCRYPT_PREFIX, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join("$");
}

async function scryptVerify(password: string, passwordHash: string) {
  const [, n, r, p, saltB64, keyB64] = passwordHash.split("$");
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (!saltB64 || !keyB64 || !Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P)) return false;
  const expected = Buffer.from(keyB64, "base64");
  if (expected.length === 0) return false;
  const actual = await deriveKey(password, Buffer.from(saltB64, "base64"), N, R, P, expected.length);
  return timingSafeEqual(actual, expected);
}

export function isLegacyPasswordHash(passwordHash: string | null | undefined) {
  return !!passwordHash && !passwordHash.startsWith(`${SCRYPT_PREFIX}$`);
}

export async function hashPassword(password: string) {
  const strengthError = validatePasswordStrength(password);
  if (strengthError) throw new Error(strengthError);
  return scryptHash(password);
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) return false;
  if (passwordHash.startsWith(`${SCRYPT_PREFIX}$`)) {
    try {
      return await scryptVerify(password, passwordHash);
    } catch {
      return false;
    }
  }
  // Legacy bcrypt hash ($2a$/$2b$/$2y$).
  return bcrypt.compare(password, passwordHash);
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Spend the same CPU time as a real verification when the account does not exist (or has no
 * password), so response time does not reveal which emails are registered.
 */
export async function verifyAgainstDummyHash(password: string) {
  dummyHashPromise ??= scryptHash(randomBytes(24).toString("base64"));
  await verifyPassword(password, await dummyHashPromise);
  return false;
}

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
