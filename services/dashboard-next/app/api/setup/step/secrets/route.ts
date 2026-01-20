import { NextRequest, NextResponse } from "next/server";

const KNOWN_SECRETS = [
  "DATABASE_URL",
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
  "YOUTUBE_API_KEY",
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "OPENAI_API_KEY",
  "WINDOWS_VM_TAILSCALE_IP",
  "LINODE_SSH_HOST",
  "HOME_SSH_HOST",
];

export async function GET() {
  try {
    const configuredSecrets = KNOWN_SECRETS.filter(key => !!process.env[key]);

    return NextResponse.json({
      success: true,
      secrets: configuredSecrets,
      total: KNOWN_SECRETS.length,
      configured: configuredSecrets.length,
    });
  } catch (error) {
    console.error("[Setup Secrets API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check secrets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || !value) {
      return NextResponse.json(
        { success: false, error: "Key and value are required" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Secret ${key} would be saved (env vars are managed by Replit)`,
      note: "In production, secrets should be set via the Replit Secrets panel or environment configuration",
    });
  } catch (error) {
    console.error("[Setup Secrets API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save secret" },
      { status: 500 }
    );
  }
}
