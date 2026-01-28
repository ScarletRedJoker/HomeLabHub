import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { NodeSSH } from "node-ssh";
import { getSSHPrivateKey } from "@/lib/server-config-store";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return verifySession(session.value);
}

const CRITICAL_SECRETS = [
  "DATABASE_URL",
  "DISCORD_TOKEN",
  "OPENAI_API_KEY",
  "SSH_PRIVATE_KEY",
  "SECRETS_ENCRYPTION_KEY",
];

const SECRET_PATTERNS = [
  /^DATABASE/,
  /^DISCORD/,
  /^OPENAI/,
  /^TWITCH/,
  /^YOUTUBE/,
  /^SPOTIFY/,
  /^GITHUB/,
  /^GOOGLE/,
  /^SSH_/,
  /^NEBULA_/,
  /^LINODE/,
  /^HOME_/,
  /^WINDOWS_/,
  /^PLEX/,
  /^REDIS/,
  /^POSTGRES/,
  /_API_KEY$/,
  /_TOKEN$/,
  /_SECRET$/,
  /_PASSWORD$/,
  /_PRIVATE_KEY$/,
  /^AUTH/,
  /^SESSION/,
  /^SECRETS_/,
  /^CLOUDFLARE/,
  /^STRIPE/,
];

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(key));
}

function getReplitSecretKeys(): string[] {
  const secretKeys: string[] = [];
  for (const key of Object.keys(process.env)) {
    if (isSecretKey(key)) {
      secretKeys.push(key);
    }
  }
  return secretKeys.sort();
}

function parseEnvFileKeys(content: string): string[] {
  const keys: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    if (key) {
      keys.push(key);
    }
  }

  return keys.sort();
}

async function getProductionSecretKeys(): Promise<{
  success: boolean;
  keys: string[];
  error?: string;
}> {
  const ssh = new NodeSSH();

  try {
    const privateKey = getSSHPrivateKey();
    if (!privateKey) {
      return {
        success: false,
        keys: [],
        error: "SSH private key not configured",
      };
    }

    const host = process.env.LINODE_SSH_HOST || "linode.evindrake.net";
    const user = process.env.LINODE_SSH_USER || "root";
    const envPath = "/opt/homelab/HomeLabHub/deploy/linode/.env";

    await ssh.connect({
      host,
      username: user,
      privateKey: privateKey.toString("utf-8"),
      port: 22,
      readyTimeout: 10000,
    });

    const result = await ssh.execCommand(`cat ${envPath} 2>/dev/null || echo "FILE_NOT_FOUND"`);

    ssh.dispose();

    if (result.stdout.trim() === "FILE_NOT_FOUND") {
      return {
        success: false,
        keys: [],
        error: `Env file not found at ${envPath}`,
      };
    }

    if (result.stderr && !result.stdout) {
      return {
        success: false,
        keys: [],
        error: result.stderr,
      };
    }

    const keys = parseEnvFileKeys(result.stdout);
    return {
      success: true,
      keys,
    };
  } catch (error: any) {
    ssh.dispose();
    return {
      success: false,
      keys: [],
      error: error.message || "SSH connection failed",
    };
  }
}

interface ComparisonResult {
  timestamp: string;
  replit: {
    keyCount: number;
    keys: string[];
  };
  production: {
    keyCount: number;
    keys: string[];
    connected: boolean;
    error?: string;
  };
  comparison: {
    inBoth: string[];
    onlyInReplit: string[];
    onlyInProduction: string[];
  };
  critical: {
    missingInReplit: string[];
    missingInProduction: string[];
  };
  summary: {
    replitTotal: number;
    productionTotal: number;
    matchCount: number;
    onlyReplitCount: number;
    onlyProductionCount: number;
    criticalMissingInReplit: number;
    criticalMissingInProduction: number;
  };
}

export async function GET(request: NextRequest): Promise<NextResponse<ComparisonResult | { error: string }>> {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const replitKeys = getReplitSecretKeys();
    const productionResult = await getProductionSecretKeys();

    const replitSet = new Set(replitKeys);
    const productionSet = new Set(productionResult.keys);

    const inBoth = replitKeys.filter((key) => productionSet.has(key));
    const onlyInReplit = replitKeys.filter((key) => !productionSet.has(key));
    const onlyInProduction = productionResult.keys.filter((key) => !replitSet.has(key));

    const missingInReplit = CRITICAL_SECRETS.filter((key) => !replitSet.has(key));
    const missingInProduction = CRITICAL_SECRETS.filter(
      (key) => productionResult.success && !productionSet.has(key)
    );

    const result: ComparisonResult = {
      timestamp: new Date().toISOString(),
      replit: {
        keyCount: replitKeys.length,
        keys: replitKeys,
      },
      production: {
        keyCount: productionResult.keys.length,
        keys: productionResult.keys,
        connected: productionResult.success,
        error: productionResult.error,
      },
      comparison: {
        inBoth,
        onlyInReplit,
        onlyInProduction,
      },
      critical: {
        missingInReplit,
        missingInProduction,
      },
      summary: {
        replitTotal: replitKeys.length,
        productionTotal: productionResult.keys.length,
        matchCount: inBoth.length,
        onlyReplitCount: onlyInReplit.length,
        onlyProductionCount: onlyInProduction.length,
        criticalMissingInReplit: missingInReplit.length,
        criticalMissingInProduction: missingInProduction.length,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Secrets Compare API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compare secrets" },
      { status: 500 }
    );
  }
}
