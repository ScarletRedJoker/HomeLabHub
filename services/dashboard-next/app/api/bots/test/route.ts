import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return verifySession(session.value);
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { botType, token } = body;

    if (!botType) {
      return NextResponse.json({ error: "Bot type is required" }, { status: 400 });
    }

    if (botType === "discord") {
      const discordToken = token || process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;

      if (!discordToken) {
        return NextResponse.json({
          success: false,
          message: "No Discord token configured",
          botInfo: null,
        });
      }

      try {
        const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
          headers: {
            Authorization: `Bot ${discordToken}`,
          },
        });

        if (!userResponse.ok) {
          const errorData = await userResponse.json().catch(() => ({}));
          return NextResponse.json({
            success: false,
            message: errorData.message || `Discord API error: ${userResponse.status}`,
            botInfo: null,
          });
        }

        const botUser: DiscordUser = await userResponse.json();

        const guildsResponse = await fetch("https://discord.com/api/v10/users/@me/guilds", {
          headers: {
            Authorization: `Bot ${discordToken}`,
          },
        });

        let guilds: DiscordGuild[] = [];
        if (guildsResponse.ok) {
          guilds = await guildsResponse.json();
        }

        return NextResponse.json({
          success: true,
          message: "Successfully connected to Discord",
          botInfo: {
            username: botUser.username,
            id: botUser.id,
            avatar: botUser.avatar,
            guilds: guilds.length,
            guildNames: guilds.slice(0, 10).map((g) => g.name),
          },
        });
      } catch (error) {
        console.error("[Bot Test API] Discord connection error:", error);
        return NextResponse.json({
          success: false,
          message: "Failed to connect to Discord API",
          botInfo: null,
        });
      }
    }

    if (botType === "twitch") {
      const twitchClientId = process.env.TWITCH_CLIENT_ID;
      const twitchToken = token || process.env.TWITCH_ACCESS_TOKEN;

      if (!twitchClientId || !twitchToken) {
        return NextResponse.json({
          success: false,
          message: "Twitch credentials not configured",
          botInfo: null,
        });
      }

      try {
        const response = await fetch("https://api.twitch.tv/helix/users", {
          headers: {
            Authorization: `Bearer ${twitchToken}`,
            "Client-Id": twitchClientId,
          },
        });

        if (!response.ok) {
          return NextResponse.json({
            success: false,
            message: `Twitch API error: ${response.status}`,
            botInfo: null,
          });
        }

        const data = await response.json();
        const user = data.data?.[0];

        return NextResponse.json({
          success: true,
          message: "Successfully connected to Twitch",
          botInfo: {
            username: user?.display_name || user?.login,
            id: user?.id,
          },
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          message: "Failed to connect to Twitch API",
          botInfo: null,
        });
      }
    }

    return NextResponse.json({
      success: false,
      message: `Unknown bot type: ${botType}`,
      botInfo: null,
    });
  } catch (error) {
    console.error("[Bot Test API] Error:", error);
    return NextResponse.json({ error: "Failed to test bot connection" }, { status: 500 });
  }
}
