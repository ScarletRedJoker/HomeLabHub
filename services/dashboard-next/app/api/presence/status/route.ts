import { NextRequest, NextResponse } from 'next/server';

const LANYARD_API_BASE = 'https://api.lanyard.rest/v1/users';
const TEST_USER_ID = '94490510688792576'; // Lanyard creator (Phineas) - known to be in Lanyard

interface ServiceStatus {
  service: string;
  healthy: boolean;
  latency?: number;
  message?: string;
}

async function checkLanyardHealth(): Promise<ServiceStatus> {
  const start = Date.now();
  
  try {
    const response = await fetch(`${LANYARD_API_BASE}/${TEST_USER_ID}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    const latency = Date.now() - start;
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        return {
          service: 'lanyard',
          healthy: true,
          latency,
          message: 'Lanyard API is responding normally',
        };
      }
    }

    return {
      service: 'lanyard',
      healthy: false,
      latency,
      message: `Lanyard API returned status ${response.status}`,
    };
  } catch (error: any) {
    return {
      service: 'lanyard',
      healthy: false,
      message: `Lanyard API unreachable: ${error.message}`,
    };
  }
}

async function checkDiscordBotHealth(): Promise<ServiceStatus> {
  const discordBotUrl = process.env.DISCORD_BOT_URL || 'http://localhost:3001';
  const start = Date.now();

  try {
    const response = await fetch(`${discordBotUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    
    const latency = Date.now() - start;

    if (response.ok) {
      return {
        service: 'discord-bot',
        healthy: true,
        latency,
        message: 'Discord bot service is running',
      };
    }

    return {
      service: 'discord-bot',
      healthy: false,
      latency,
      message: `Discord bot returned status ${response.status}`,
    };
  } catch (error: any) {
    return {
      service: 'discord-bot',
      healthy: false,
      message: `Discord bot unreachable: ${error.message}`,
    };
  }
}

export async function GET(request: NextRequest) {
  const [lanyardStatus, discordBotStatus] = await Promise.all([
    checkLanyardHealth(),
    checkDiscordBotHealth(),
  ]);

  const services = [lanyardStatus, discordBotStatus];
  const allHealthy = services.every(s => s.healthy);

  return NextResponse.json({
    success: true,
    healthy: allHealthy,
    services,
    timestamp: Date.now(),
    documentation: {
      lanyard: {
        website: 'https://lanyard.rest',
        github: 'https://github.com/Phineas/lanyard',
        discord: 'https://discord.gg/lanyard',
        api: 'https://api.lanyard.rest/v1/users/{user_id}',
        websocket: 'wss://api.lanyard.rest/socket',
      },
      setup: {
        step1: 'User joins the Lanyard Discord server: https://discord.gg/lanyard',
        step2: 'Their Discord ID is automatically tracked',
        step3: 'No API key needed - completely free public service',
        step4: 'Use GET /api/presence?userId=DISCORD_ID to fetch presence',
      },
    },
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
