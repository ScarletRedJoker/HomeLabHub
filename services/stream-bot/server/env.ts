/**
 * Environment variable helper with STREAMBOT_ prefix fallback support
 * 
 * For unified homelab deployments, environment variables are prefixed with STREAMBOT_
 * This helper checks STREAMBOT_ prefixed version first, then falls back to unprefixed
 * 
 * Priority order:
 * 1. STREAMBOT_<KEY> (if set)
 * 2. <KEY> (if set)
 * 3. defaultValue (if provided)
 * 
 * Examples:
 * - getEnv('DATABASE_URL') checks STREAMBOT_DATABASE_URL, then DATABASE_URL
 * - getEnv('SESSION_SECRET') checks STREAMBOT_SESSION_SECRET, then SESSION_SECRET
 */

export function getEnv(key: string): string | undefined;
export function getEnv(key: string, defaultValue: string): string;
export function getEnv(key: string, defaultValue?: string): string | undefined {
  // Priority 1: STREAMBOT_ prefixed version (for unified deployments)
  const prefixedValue = process.env[`STREAMBOT_${key}`];
  if (prefixedValue !== undefined) {
    return prefixedValue;
  }

  // Priority 2: Direct variable
  const directValue = process.env[key];
  if (directValue !== undefined) {
    return directValue;
  }

  // Priority 3: Default value
  return defaultValue;
}

export function requireEnv(key: string, errorMessage?: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(errorMessage || `${key} (or STREAMBOT_${key}) must be set`);
  }
  return value;
}

/**
 * Feature Flags
 * These flags determine which optional features are enabled based on environment configuration
 */

/**
 * OBS WebSocket integration feature flag
 * OBS features are enabled only when OBS_WEBSOCKET_HOST is configured
 * This allows stream-bot to run in multi-tenant environments where not all users have OBS
 */
export const OBS_ENABLED = !!getEnv('OBS_WEBSOCKET_HOST');

/**
 * Get all feature flags for API exposure
 */
export function getFeatureFlags() {
  return {
    obs: OBS_ENABLED,
  };
}
