// Avoids visually ambiguous characters (0/O, 1/l/I) since a generated
// password is often read back off a screen to type or verify manually.
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function randomChar(pool: string): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return pool[bytes[0] % pool.length];
}

export function generateStrongPassword(length = 14): string {
  // Guarantee at least one of each character class, then fill the rest
  // randomly and shuffle — simple way to keep it both strong and never
  // accidentally all-letters or all-digits.
  const required = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SYMBOLS)];
  const rest = Array.from({ length: Math.max(length - required.length, 0) }, () => randomChar(ALL));
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
