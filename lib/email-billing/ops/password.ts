import 'server-only';
import crypto from 'node:crypto';

// No look-alike characters (0/O, 1/l/I) so a password read out or typed from a screen is not mistyped.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SYMBOLS = '-_.@#%';

/**
 * Random password for a mailbox. Meets Mail-in-a-Box's rules (8+ characters, no leading or trailing whitespace) and
 * mixes letters, digits and one symbol. Never persisted or logged by the callers.
 */
export function generateMailboxPassword(length = 20): string {
  const pick = (chars: string) => chars[crypto.randomInt(chars.length)];
  // Starts with a letter; the rest always contains a digit and a symbol, shuffled with a CSPRNG.
  const rest = [...Array.from({ length: Math.max(12, length) - 3 }, () => pick(ALPHABET)), pick('23456789'), pick(SYMBOLS)];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return pick(ALPHABET) + rest.join('');
}
