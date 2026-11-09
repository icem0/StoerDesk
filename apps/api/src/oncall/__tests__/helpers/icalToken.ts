/**
 * Helper for the iCal token tests.
 *
 * The signature of a token is a base64url encoded HMAC-SHA256 (32 bytes, 43
 * characters). Its last character carries only four significant bits, so a
 * fixed replacement of that character rebuilds the original token in about one
 * of sixteen runs — a tampered token that was still valid. The helper changes
 * the first character instead, which always produces a different signature.
 */
export function tamperedSignature(signature: string): string {
  return `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`
}
