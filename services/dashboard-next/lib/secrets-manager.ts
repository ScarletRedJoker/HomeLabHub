/**
 * Secrets Manager - Cross-environment secret management for Nebula Command
 * Supports environment variables, .env files, and future Vault integration
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { createHash, randomBytes } from "crypto";
import path from "path";
import { detectEnvironment, type Environment } from "./env-bootstrap";

export interface SecretConfig {
  source: "env" | "file" | "vault";
  envFile: string | null;
  secretsDir: string | null;
  required: string[];
  optional?: string[];
}

export interface SecretsResult {
  loaded: Record<string, string>;
  missing: string[];
  source: string;
  environment: Environment;
}

export interface TokenInfo {
  token: string;
  nodeId: string;
  createdAt: string;
  expiresAt: string | null;
  rotatedAt?: string;
}

const ENV_CONFIG: Record<Environment, SecretConfig> = {
  linode: {
    source: "file",
    envFile: "/opt/homelab/.env",
    secretsDir: "/opt/homelab/secrets",
    required: [
      "DATABASE_URL",
      "DISCORD_TOKEN",
      "OPENAI_API_KEY",
    ],
    optional: [
      "TWITCH_CLIENT_ID",
      "TWITCH_CLIENT_SECRET",
      "SPOTIFY_CLIENT_ID",
      "SPOTIFY_CLIENT_SECRET",
      "SSH_PRIVATE_KEY",
    ],
  },
  "ubuntu-home": {
    source: "file",
    envFile: "/opt/nebula/.env",
    secretsDir: "/opt/nebula/secrets",
    required: [],
    optional: [
      "PLEX_TOKEN",
      "TRANSMISSION_PASSWORD",
    ],
  },
  "windows-vm": {
    source: "env",
    envFile: "C:\\NebulaCommand\\.env",
    secretsDir: "C:\\NebulaCommand\\secrets",
    required: [
      "NEBULA_AGENT_TOKEN",
    ],
    optional: [],
  },
  replit: {
    source: "env",
    envFile: null,
    secretsDir: null,
    required: [
      "DATABASE_URL",
    ],
    optional: [
      "DISCORD_TOKEN",
      "OPENAI_API_KEY",
      "SSH_PRIVATE_KEY",
    ],
  },
};

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadFromEnvFile(filePath: string): Record<string, string> {
  try {
    if (!existsSync(filePath)) {
      console.log(`[SecretsManager] Env file not found: ${filePath}`);
      return {};
    }

    const content = readFileSync(filePath, "utf-8");
    return parseEnvFile(content);
  } catch (error) {
    console.error(`[SecretsManager] Failed to read env file: ${error}`);
    return {};
  }
}

function loadFromSecretsDir(secretsDir: string, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  if (!existsSync(secretsDir)) {
    return result;
  }

  for (const key of keys) {
    const filePath = path.join(secretsDir, key);
    try {
      if (existsSync(filePath)) {
        result[key] = readFileSync(filePath, "utf-8").trim();
      }
    } catch {
      // Silent fail for individual secrets
    }
  }

  return result;
}

export function loadSecrets(environment?: Environment): SecretsResult {
  const env = environment || detectEnvironment();
  const config = ENV_CONFIG[env];
  const loaded: Record<string, string> = {};
  const missing: string[] = [];
  let source = "environment";

  console.log(`[SecretsManager] Loading secrets for environment: ${env}`);

  const allKeys = [...config.required, ...(config.optional || [])];

  for (const key of allKeys) {
    if (process.env[key]) {
      loaded[key] = process.env[key]!;
    }
  }

  if (config.source === "file" && config.envFile) {
    const envFileSecrets = loadFromEnvFile(config.envFile);
    for (const [key, value] of Object.entries(envFileSecrets)) {
      if (!loaded[key] && allKeys.includes(key)) {
        loaded[key] = value;
      }
    }
    if (Object.keys(envFileSecrets).length > 0) {
      source = config.envFile;
    }
  }

  if (config.secretsDir) {
    const dirSecrets = loadFromSecretsDir(config.secretsDir, allKeys);
    for (const [key, value] of Object.entries(dirSecrets)) {
      if (!loaded[key]) {
        loaded[key] = value;
      }
    }
  }

  for (const key of config.required) {
    if (!loaded[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.warn(`[SecretsManager] Missing required secrets: ${missing.join(", ")}`);
  }

  console.log(`[SecretsManager] Loaded ${Object.keys(loaded).length} secrets from ${source}`);

  return {
    loaded,
    missing,
    source,
    environment: env,
  };
}

export function generateNodeToken(nodeId: string): TokenInfo {
  const tokenBytes = randomBytes(32);
  const token = tokenBytes.toString("base64url");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const info: TokenInfo = {
    token,
    nodeId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  console.log(`[SecretsManager] Generated token for node: ${nodeId}`);

  return info;
}

export function rotateToken(nodeId: string, existingToken?: string): TokenInfo {
  const newInfo = generateNodeToken(nodeId);
  newInfo.rotatedAt = new Date().toISOString();

  console.log(`[SecretsManager] Rotated token for node: ${nodeId}`);

  return newInfo;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function validateToken(providedToken: string, storedHash: string): boolean {
  const providedHash = hashToken(providedToken);
  return providedHash === storedHash;
}

export function saveTokenToFile(tokenInfo: TokenInfo, outputPath: string): void {
  try {
    const dir = path.dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(outputPath, JSON.stringify(tokenInfo, null, 2));
    console.log(`[SecretsManager] Token saved to: ${outputPath}`);
  } catch (error) {
    console.error(`[SecretsManager] Failed to save token: ${error}`);
    throw error;
  }
}

export function loadTokenFromFile(filePath: string): TokenInfo | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as TokenInfo;
  } catch (error) {
    console.error(`[SecretsManager] Failed to load token: ${error}`);
    return null;
  }
}

export function getSecretConfig(environment?: Environment): SecretConfig {
  const env = environment || detectEnvironment();
  return ENV_CONFIG[env];
}

export function injectSecrets(secrets: Record<string, string>): void {
  for (const [key, value] of Object.entries(secrets)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export async function bootstrapSecrets(): Promise<SecretsResult> {
  const result = loadSecrets();

  injectSecrets(result.loaded);

  if (result.missing.length === 0) {
    console.log(`[SecretsManager] All required secrets loaded successfully`);
  }

  return result;
}

export function getMissingSecretGuide(missing: string[]): string {
  const guides: Record<string, string> = {
    DATABASE_URL: "PostgreSQL connection string (e.g., postgresql://user:pass@host:5432/db)",
    DISCORD_TOKEN: "Discord bot token from https://discord.com/developers/applications",
    OPENAI_API_KEY: "OpenAI API key from https://platform.openai.com/api-keys",
    NEBULA_AGENT_TOKEN: "Generated token for agent authentication (use generateNodeToken)",
    SSH_PRIVATE_KEY: "PEM-format private key for SSH connections",
    TWITCH_CLIENT_ID: "Twitch application client ID from https://dev.twitch.tv/console",
    TWITCH_CLIENT_SECRET: "Twitch application client secret",
    PLEX_TOKEN: "Plex authentication token",
  };

  const lines = ["Missing secrets configuration guide:", ""];

  for (const key of missing) {
    const guide = guides[key] || "No description available";
    lines.push(`  ${key}:`);
    lines.push(`    ${guide}`);
    lines.push("");
  }

  return lines.join("\n");
}

export interface VaultConfig {
  address: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
}

export async function loadFromVault(
  config: VaultConfig,
  secretPath: string
): Promise<Record<string, string> | null> {
  console.log(`[SecretsManager] Vault integration not yet implemented`);
  console.log(`[SecretsManager] Would load from: ${config.address}/${secretPath}`);
  return null;
}

export default {
  loadSecrets,
  generateNodeToken,
  rotateToken,
  hashToken,
  validateToken,
  saveTokenToFile,
  loadTokenFromFile,
  getSecretConfig,
  injectSecrets,
  bootstrapSecrets,
  getMissingSecretGuide,
  loadFromVault,
};
