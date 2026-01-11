import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

interface PlatformStatus {
  platform: string;
  isConnected: boolean;
  needsReauth: boolean;
  status: "active" | "needs_reconnect" | "not_connected" | "unknown";
  statusText: string;
}

interface StreamBotResponse {
  success: boolean;
  platforms: Array<{
    platform: string;
    isConnected: boolean;
    needsReauth?: boolean;
    needsRefresh?: boolean;
    status?: string;
  }>;
}

interface DiscordBotHealth {
  status: string;
  bot?: {
    ready: boolean;
  };
}

async function checkStreamBotPlatforms(): Promise<PlatformStatus[]> {
  const streamBotUrl = process.env.STREAM_BOT_URL || (process.env.NODE_ENV === "production" ? "http://stream-bot:5000" : "http://localhost:3000");
  const platforms: PlatformStatus[] = [];

  try {
    const overviewRes = await fetch(`${streamBotUrl}/api/platforms/overview`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (overviewRes.ok) {
      const data = await overviewRes.json() as StreamBotResponse;
      
      for (const p of data.platforms || []) {
        let status: PlatformStatus["status"] = "not_connected";
        let statusText = "Not Connected";

        if (p.isConnected) {
          if (p.needsReauth || p.needsRefresh) {
            status = "needs_reconnect";
            statusText = "Needs Reconnect";
          } else {
            status = "active";
            statusText = "Active";
          }
        }

        platforms.push({
          platform: p.platform,
          isConnected: p.isConnected,
          needsReauth: p.needsReauth || p.needsRefresh || false,
          status,
          statusText,
        });
      }
    }

    const hasTwitch = platforms.some(p => p.platform === "twitch");
    const hasYoutube = platforms.some(p => p.platform === "youtube");

    if (!hasTwitch) {
      platforms.push({ platform: "twitch", isConnected: false, needsReauth: false, status: "not_connected", statusText: "Not Connected" });
    }
    if (!hasYoutube) {
      platforms.push({ platform: "youtube", isConnected: false, needsReauth: false, status: "not_connected", statusText: "Not Connected" });
    }

    return platforms;
  } catch (error) {
    console.error("[Platform Status] Error checking stream-bot:", error);
    return [
      { platform: "twitch", isConnected: false, needsReauth: false, status: "unknown", statusText: "Unknown" },
      { platform: "youtube", isConnected: false, needsReauth: false, status: "unknown", statusText: "Unknown" },
    ];
  }
}

async function checkDiscordBot(): Promise<PlatformStatus> {
  const discordBotUrl = process.env.DISCORD_BOT_URL || (process.env.NODE_ENV === "production" ? "http://discord-bot:4000" : "http://localhost:4000");

  try {
    const res = await fetch(`${discordBotUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json() as DiscordBotHealth;
      const isReady = data.status === "healthy" || data.bot?.ready === true;

      return {
        platform: "discord",
        isConnected: isReady,
        needsReauth: false,
        status: isReady ? "active" : "not_connected",
        statusText: isReady ? "Active" : "Not Connected",
      };
    }

    return {
      platform: "discord",
      isConnected: false,
      needsReauth: false,
      status: "not_connected",
      statusText: "Not Connected",
    };
  } catch (error) {
    console.error("[Platform Status] Error checking discord-bot:", error);
    return {
      platform: "discord",
      isConnected: false,
      needsReauth: false,
      status: "unknown",
      statusText: "Unknown",
    };
  }
}

export async function GET() {
  try {
    const [streamPlatforms, discord] = await Promise.all([
      checkStreamBotPlatforms(),
      checkDiscordBot(),
    ]);

    return NextResponse.json({
      success: true,
      platforms: [discord, ...streamPlatforms],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Platform Status] Error:", error);
    return NextResponse.json({
      success: false,
      platforms: [
        { platform: "discord", isConnected: false, needsReauth: false, status: "unknown", statusText: "Unknown" },
        { platform: "twitch", isConnected: false, needsReauth: false, status: "unknown", statusText: "Unknown" },
        { platform: "youtube", isConnected: false, needsReauth: false, status: "unknown", statusText: "Unknown" },
      ],
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
