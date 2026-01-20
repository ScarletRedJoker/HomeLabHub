import { NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { sql } from "drizzle-orm";

interface ValidationResult {
  step: string;
  valid: boolean;
  required: boolean;
  errors: string[];
  warnings: string[];
  details?: Record<string, unknown>;
}

interface ValidationReport {
  overallValid: boolean;
  canComplete: boolean;
  steps: ValidationResult[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

const REQUIRED_SECRETS = ["DATABASE_URL"];
const CRITICAL_SECRETS = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];

async function checkEndpoint(url: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function validateSecrets(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: Record<string, boolean> = {};

  for (const secret of REQUIRED_SECRETS) {
    const exists = !!process.env[secret];
    details[secret] = exists;
    if (!exists) {
      errors.push(`Missing required secret: ${secret}`);
    }
  }

  for (const secret of CRITICAL_SECRETS) {
    const exists = !!process.env[secret];
    details[secret] = exists;
    if (!exists) {
      warnings.push(`Missing critical secret: ${secret} (Discord bot will not work)`);
    }
  }

  const optionalSecrets = [
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "YOUTUBE_API_KEY",
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
    "OPENAI_API_KEY",
  ];

  for (const secret of optionalSecrets) {
    details[secret] = !!process.env[secret];
  }

  return {
    step: "secrets",
    valid: errors.length === 0,
    required: true,
    errors,
    warnings,
    details,
  };
}

async function validateDatabase(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: Record<string, unknown> = {};

  if (!isDbConnected()) {
    return {
      step: "database",
      valid: false,
      required: true,
      errors: ["DATABASE_URL not configured"],
      warnings: [],
      details: { connected: false },
    };
  }

  try {
    const versionResult = await db.execute(sql`SELECT version()`);
    const version = (versionResult.rows[0] as any)?.version?.split(" ").slice(0, 2).join(" ") || "Unknown";
    details.version = version;
    details.connected = true;

    const tablesResult = await db.execute(sql`
      SELECT count(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = parseInt((tablesResult.rows[0] as any)?.count || "0", 10);
    details.tables = tables;

    if (tables === 0) {
      warnings.push("No tables found - migrations may be needed");
    }
  } catch (error) {
    errors.push(`Database connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    details.connected = false;
  }

  return {
    step: "database",
    valid: errors.length === 0,
    required: true,
    errors,
    warnings,
    details,
  };
}

async function validateAI(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: Record<string, unknown> = {};

  const windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP;
  const ollamaEndpoint = windowsVmIp ? `http://${windowsVmIp}:11434` : null;

  details.ollamaEndpoint = ollamaEndpoint;
  details.openaiConfigured = !!process.env.OPENAI_API_KEY;

  if (ollamaEndpoint) {
    const ollamaAvailable = await checkEndpoint(`${ollamaEndpoint}/api/tags`);
    details.ollamaAvailable = ollamaAvailable;

    if (!ollamaAvailable) {
      warnings.push("Ollama is not reachable - local AI features will be unavailable");
    } else {
      try {
        const response = await fetch(`${ollamaEndpoint}/api/tags`);
        if (response.ok) {
          const data = await response.json();
          const models = data.models?.map((m: { name: string }) => m.name) || [];
          details.ollamaModels = models;
          if (models.length === 0) {
            warnings.push("No Ollama models installed - run 'ollama pull llama3.2' to get started");
          }
        }
      } catch {}
    }

    const comfyuiAvailable = await checkEndpoint(`http://${windowsVmIp}:8188/`);
    details.comfyuiAvailable = comfyuiAvailable;
  } else {
    warnings.push("No GPU server configured (WINDOWS_VM_TAILSCALE_IP) - local AI unavailable");
    details.ollamaAvailable = false;
    details.comfyuiAvailable = false;
  }

  if (!details.openaiConfigured && !details.ollamaAvailable) {
    warnings.push("No AI services available - configure OpenAI API key or Ollama for AI features");
  }

  return {
    step: "ai",
    valid: true,
    required: false,
    errors,
    warnings,
    details,
  };
}

async function validatePlatforms(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: Record<string, unknown> = {};

  const discordToken = process.env.DISCORD_TOKEN;
  const discordClientId = process.env.DISCORD_CLIENT_ID;

  details.discordConfigured = !!(discordToken && discordClientId);
  details.twitchConfigured = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
  details.youtubeConfigured = !!process.env.YOUTUBE_API_KEY;
  details.spotifyConfigured = !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

  if (!details.discordConfigured) {
    warnings.push("Discord not configured - Discord bot features will be unavailable");
  } else {
    try {
      const response = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${discordToken}` },
      });
      details.discordValid = response.ok;
      if (!response.ok) {
        errors.push("Discord token is invalid");
      }
    } catch {
      warnings.push("Could not verify Discord token");
    }
  }

  const configuredCount = [
    details.discordConfigured,
    details.twitchConfigured,
    details.youtubeConfigured,
    details.spotifyConfigured,
  ].filter(Boolean).length;

  details.configuredPlatforms = configuredCount;

  if (configuredCount === 0) {
    warnings.push("No platforms configured - consider adding at least Discord for full functionality");
  }

  return {
    step: "platforms",
    valid: errors.length === 0,
    required: false,
    errors,
    warnings,
    details,
  };
}

async function validateDeployment(): Promise<ValidationResult> {
  const warnings: string[] = [];
  const details: Record<string, unknown> = {};

  const linodeHost = process.env.LINODE_SSH_HOST;
  const ubuntuHost = process.env.HOME_SSH_HOST;
  const windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP;

  details.linodeConfigured = !!linodeHost;
  details.ubuntuHomeConfigured = !!ubuntuHost;
  details.windowsVmConfigured = !!windowsVmIp;

  const configuredServers = [linodeHost, ubuntuHost, windowsVmIp].filter(Boolean).length;
  details.configuredServers = configuredServers;

  if (configuredServers === 0) {
    warnings.push("No deployment targets configured - you can add them later in Settings");
  }

  return {
    step: "deployment",
    valid: true,
    required: false,
    errors: [],
    warnings,
    details,
  };
}

export async function GET() {
  try {
    const [secretsResult, databaseResult, aiResult, platformsResult, deploymentResult] = await Promise.all([
      validateSecrets(),
      validateDatabase(),
      validateAI(),
      validatePlatforms(),
      validateDeployment(),
    ]);

    const steps = [secretsResult, databaseResult, aiResult, platformsResult, deploymentResult];

    const requiredStepsValid = steps.filter((s) => s.required).every((s) => s.valid);
    const allStepsValid = steps.every((s) => s.valid);
    const totalWarnings = steps.reduce((acc, s) => acc + s.warnings.length, 0);

    const report: ValidationReport = {
      overallValid: allStepsValid,
      canComplete: requiredStepsValid,
      steps,
      summary: {
        passed: steps.filter((s) => s.valid).length,
        failed: steps.filter((s) => !s.valid).length,
        warnings: totalWarnings,
      },
    };

    return NextResponse.json({
      success: true,
      ...report,
    });
  } catch (error) {
    console.error("[Setup Validate API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Validation failed" },
      { status: 500 }
    );
  }
}
