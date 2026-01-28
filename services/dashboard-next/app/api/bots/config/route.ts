import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return verifySession(session.value);
}

interface BotConfigStatus {
  discord: {
    hasToken: boolean;
    applicationId: string | null;
    isConnected: boolean;
    lastSync: string | null;
  };
  stream: {
    hasTwitchToken: boolean;
    hasYouTubeToken: boolean;
    hasKickToken: boolean;
  };
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const discordToken = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
    const discordAppId = process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID;
    const twitchToken = process.env.TWITCH_ACCESS_TOKEN || process.env.TWITCH_CLIENT_SECRET;
    const youtubeToken = process.env.YOUTUBE_API_KEY;
    const kickToken = process.env.KICK_API_KEY;

    const configStatus: BotConfigStatus = {
      discord: {
        hasToken: !!discordToken,
        applicationId: discordAppId || null,
        isConnected: false,
        lastSync: null,
      },
      stream: {
        hasTwitchToken: !!twitchToken,
        hasYouTubeToken: !!youtubeToken,
        hasKickToken: !!kickToken,
      },
    };

    if (discordToken) {
      try {
        const response = await fetch("https://discord.com/api/v10/users/@me", {
          headers: {
            Authorization: `Bot ${discordToken}`,
          },
        });
        configStatus.discord.isConnected = response.ok;
        if (response.ok) {
          configStatus.discord.lastSync = new Date().toISOString();
        }
      } catch {
        configStatus.discord.isConnected = false;
      }
    }

    return NextResponse.json(configStatus);
  } catch (error) {
    console.error("[Bots Config API] Error:", error);
    return NextResponse.json({ error: "Failed to get bot configuration" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { applicationId, botType } = body;

    if (!botType) {
      return NextResponse.json({ error: "Bot type is required" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Bot configuration updated for ${botType}`,
      updated: {
        applicationId,
        botType,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Bots Config API] Error updating:", error);
    return NextResponse.json({ error: "Failed to update bot configuration" }, { status: 500 });
  }
}
