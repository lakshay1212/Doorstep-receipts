import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header value Ring sends: "sha256=<hex hmac of the raw body>" */
export function signBody(signingKey: string, rawBody: Buffer | string): string {
  return 'sha256=' + createHmac('sha256', signingKey).update(rawBody).digest('hex');
}

/**
 * Verify Ring's X-Signature header over the *raw* request bytes.
 * Never verify against re-serialized JSON: whitespace changes break the HMAC.
 */
export function verifySignature(
  signingKey: string,
  rawBody: Buffer | string,
  header: string | undefined,
): boolean {
  if (!header) return false;
  const received = (header.startsWith('sha256=') ? header.slice(7) : header).trim();
  const expected = createHmac('sha256', signingKey).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
