/**
 * Environment-aware configuration module for stream-bot service.
 * Detects whether running on Replit or production Ubuntu server.
 */

export interface OpenAIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface YouTubeConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  useConnector: boolean;
}

export interface DatabaseConfig {
  url: string;
}

/**
 * Detect if running on Replit environment
 */
export function isReplit(): boolean {
  return !!(process.env.REPL_ID || process.env.REPLIT_CONNECTORS_HOSTNAME);
}

/**
 * Get OpenAI configuration based on environment.
 * 
 * - On Replit: Uses AI_INTEGRATIONS_* variables (Replit AI Integrations)
 * - On Production: Uses OPENAI_API_KEY directly
 */
export function getOpenAIConfig(): OpenAIConfig {
  if (isReplit()) {
    // Replit AI Integrations (no API key needed)
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "";

    if (!apiKey || !baseURL) {
      throw new Error(
        "Running on Replit but AI_INTEGRATIONS_* env vars are missing. " +
          "Please set up the OpenAI integration."
      );
    }

    // Using gpt-4o for Replit environment (gpt-5 not available in production)
    const model = process.env.STREAMBOT_FACT_MODEL || "gpt-4o";

    return { apiKey, baseURL, model };
  } else {
    // Production environment - use self-managed API key
    const apiKey = process.env.OPENAI_API_KEY || process.env.STREAMBOT_OPENAI_API_KEY || "";
    const baseURL =
      process.env.OPENAI_BASE_URL ||
      process.env.STREAMBOT_OPENAI_BASE_URL ||
      "https://api.openai.com/v1";
    const model = process.env.STREAMBOT_FACT_MODEL || "gpt-4o";

    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY or STREAMBOT_OPENAI_API_KEY is required in production environment. " +
          "Please add it to your .env file."
      );
    }

    return { apiKey, baseURL, model };
  }
}

/**
 * Get YouTube OAuth configuration.
 * 
 * Both Replit and production use standard OAuth with client credentials.
 * YouTube Connector API (for developer access) is separate from user OAuth.
 */
export function getYouTubeConfig(): YouTubeConfig {
  const clientId = process.env.YOUTUBE_CLIENT_ID || "";
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || "";
  // YOUTUBE_REDIRECT_URI is for platform connection (direct OAuth at /auth/youtube/callback)
  // YOUTUBE_SIGNIN_CALLBACK_URL is for passport signin (at /api/auth/youtube/callback)
  // For platform connection, default to /auth/youtube/callback
  const appUrl = process.env.APP_URL || "https://stream.rig-city.com";
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || `${appUrl}/auth/youtube/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "YouTube OAuth not configured. YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are required. " +
      "Get credentials from: https://console.cloud.google.com/apis/credentials"
    );
  }

  if (!redirectUri) {
    throw new Error(
      "YouTube OAuth redirect URI not configured. " +
      "YOUTUBE_REDIRECT_URI or YOUTUBE_SIGNIN_CALLBACK_URL is required."
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    useConnector: false, // User OAuth always uses standard flow
  };
}

/**
 * Get database URL with validation
 */
export function getDatabaseURL(): string {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL is not set. Please configure database connection."
    );
  }

  // Verify it's not an unexpanded variable
  if (dbUrl.includes("${")) {
    throw new Error(
      `DATABASE_URL contains unexpanded variable: ${dbUrl}. ` +
        `Please set the fully resolved connection string.`
    );
  }

  return dbUrl;
}

/**
 * Get environment information for debugging
 */
export function getEnvironmentInfo() {
  return {
    isReplit: isReplit(),
    hasAIIntegrations: !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    hasOpenAIKey: !!(process.env.OPENAI_API_KEY || process.env.STREAMBOT_OPENAI_API_KEY),
    hasDatabase: !!process.env.DATABASE_URL,
    hasYouTubeConfig: !!(process.env.YOUTUBE_CLIENT_ID || isReplit()),
    nodeEnv: process.env.NODE_ENV || "development",
  };
}
