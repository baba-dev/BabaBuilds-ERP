import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";

const BCRYPT_COST = 12;
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

export async function hashPassword(password: string) {
  const strengthError = validatePasswordStrength(password);
  if (strengthError) throw new Error(strengthError);
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
