/**
 * Utilities for the "test-app-feature" feature.
 * Handles validation and formatting of feature descriptions.
 */

export const FEATURE_DESCRIPTION_MAX_LENGTH = 2000;
export const FEATURE_DESCRIPTION_MIN_LENGTH = 10;

/**
 * Validates a feature description string.
 * Returns an error message if invalid, or null if valid.
 */
export function validateFeatureDescription(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // optional field — blank is OK
  if (trimmed.length < FEATURE_DESCRIPTION_MIN_LENGTH) {
    return `Feature description must be at least ${FEATURE_DESCRIPTION_MIN_LENGTH} characters.`;
  }
  if (trimmed.length > FEATURE_DESCRIPTION_MAX_LENGTH) {
    return `Feature description must be at most ${FEATURE_DESCRIPTION_MAX_LENGTH} characters.`;
  }
  return null;
}

/**
 * Normalises a raw feature description for storage: trims whitespace,
 * returns undefined when blank so callers can omit the field cleanly.
 */
export function normaliseFeatureDescription(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
