import { NextRequest, NextResponse } from "next/server";

interface PlatformStatus {
  name: string;
  connected: boolean;
  username?: string;
  error?: string;
}

async function checkDiscord(): Promise<PlatformStatus> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    return { name: "Discord", connected: false, error: "Token not configured" };
  }

  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });

    if (response.ok) {
      const data = await response.json();
      return { name: "Discord", connected: true, username: data.username };
    }
    return { name: "Discord", connected: false, error: "Invalid token" };
  } catch (error) {
    return { name: "Discord", connected: false, error: "Connection failed" };
  }
}

async function checkTwitch(): Promise<PlatformStatus> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return { name: "Twitch", connected: false, error: "Credentials not configured" };
  }

  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });

    if (response.ok) {
      return { name: "Twitch", connected: true };
    }
    return { name: "Twitch", connected: false, error: "Invalid credentials" };
  } catch (error) {
    return { name: "Twitch", connected: false, error: "Connection failed" };
  }
}

async function checkYouTube(): Promise<PlatformStatus> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    return { name: "YouTube", connected: false, error: "API key not configured" };
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&mine=false&key=${apiKey}&maxResults=1`
    );

    if (response.ok || response.status === 400) {
      return { name: "YouTube", connected: true };
    }
    return { name: "YouTube", connected: false, error: "Invalid API key" };
  } catch (error) {
    return { name: "YouTube", connected: false, error: "Connection failed" };
  }
}

async function checkSpotify(): Promise<PlatformStatus> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return { name: "Spotify", connected: false, error: "Credentials not configured" };
  }

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });

    if (response.ok) {
      return { name: "Spotify", connected: true };
    }
    return { name: "Spotify", connected: false, error: "Invalid credentials" };
  } catch (error) {
    return { name: "Spotify", connected: false, error: "Connection failed" };
  }
}

export async function GET() {
  try {
    const platforms = await Promise.all([
      checkDiscord(),
      checkTwitch(),
      checkYouTube(),
      checkSpotify(),
    ]);

    return NextResponse.json({
      success: true,
      platforms,
    });
  } catch (error) {
    console.error("[Setup Platforms API] Error:", error);
    return NextResponse.json({
      success: false,
      platforms: [],
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, platform } = body;

    if (action === "test") {
      let result: PlatformStatus;
      
      switch (platform) {
        case "Discord":
          result = await checkDiscord();
          break;
        case "Twitch":
          result = await checkTwitch();
          break;
        case "YouTube":
          result = await checkYouTube();
          break;
        case "Spotify":
          result = await checkSpotify();
          break;
        default:
          return NextResponse.json(
            { success: false, error: "Unknown platform" },
            { status: 400 }
          );
      }

      return NextResponse.json({
        success: true,
        result,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Setup Platforms API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Platform test failed" },
      { status: 500 }
    );
  }
}
