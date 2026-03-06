/**
 * Client-side URL validation for QA project target URLs.
 * The edge function re-validates server-side — this is for UX only.
 */

const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // link-local
  /^fc[0-9a-f]{2}:/i,              // IPv6 ULA
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

/**
 * Validates a target URL for a QA project.
 * Returns an error string if invalid, or null if the URL is acceptable.
 */
export function validateTargetUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "URL is required.";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Please enter a valid URL (e.g. https://example.com).";
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return "URL must start with http:// or https://.";
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return "Localhost URLs are not supported. Use a publicly accessible URL.";
  }

  if (PRIVATE_IP_PATTERNS.some((r) => r.test(hostname))) {
    return "Private / internal IP addresses are not supported.";
  }

  // Block metadata endpoints (common cloud IMDSv1/v2)
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
    return "That address is not allowed.";
  }

  return null;
}

/** Normalises a URL: lowercase scheme/host, remove trailing slash on root paths. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    // Lowercase protocol + host, keep path/query/hash as-is
    const normalized = `${u.protocol}//${u.host}${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`;
    return normalized;
  } catch {
    return raw.trim();
  }
}
