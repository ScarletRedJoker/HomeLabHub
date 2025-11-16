import { pool } from "./db";
import { botManager } from "./bot-manager";

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  service: string;
  version: string;
  dependencies: {
    database: {
      status: 'up' | 'down';
      latency?: number;
      error?: string;
    };
    bot: {
      status: 'operational' | 'idle' | 'down';
      totalWorkers: number;
      activeWorkers: number;
      error?: string;
    };
  };
  platforms: {
    twitch: {
      status: 'connected' | 'disconnected';
      connections: number;
      total: number;
    };
    youtube: {
      status: 'connected' | 'disconnected';
      connections: number;
      total: number;
    };
    kick: {
      status: 'connected' | 'disconnected';
      connections: number;
      total: number;
    };
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const health: HealthStatus = {
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'stream-bot',
    version: process.env.npm_package_version || '1.0.0',
    dependencies: {
      database: {
        status: 'down'
      },
      bot: {
        status: 'down',
        totalWorkers: 0,
        activeWorkers: 0
      }
    },
    platforms: {
      twitch: { status: 'disconnected', connections: 0, total: 0 },
      youtube: { status: 'disconnected', connections: 0, total: 0 },
      kick: { status: 'disconnected', connections: 0, total: 0 }
    },
    memory: {
      used: 0,
      total: 0,
      percentage: 0
    }
  };

  // Check database connection
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    health.dependencies.database.status = 'up';
    health.dependencies.database.latency = Date.now() - dbStart;
  } catch (error: any) {
    health.dependencies.database.status = 'down';
    health.dependencies.database.error = error.message;
    health.status = 'degraded';
    console.error('[Health] Database check failed:', error.message);
  }

  // Check bot manager status
  try {
    const managerStats = botManager.getStats();
    health.dependencies.bot.totalWorkers = managerStats.totalWorkers;
    health.dependencies.bot.activeWorkers = managerStats.activeWorkers;
    health.dependencies.bot.status = managerStats.activeWorkers > 0 ? 'operational' : 'idle';
  } catch (error: any) {
    health.dependencies.bot.status = 'down';
    health.dependencies.bot.error = error.message;
    health.status = 'degraded';
    console.error('[Health] Bot manager check failed:', error.message);
  }

  // Check platform connections
  try {
    const { db } = await import('./db');
    const { platformConnections } = await import('@shared/schema');
    
    const allConnections = await db.query.platformConnections.findMany();
    
    const platformStatuses = {
      twitch: { connected: 0, total: 0 },
      youtube: { connected: 0, total: 0 },
      kick: { connected: 0, total: 0 }
    };

    for (const conn of allConnections) {
      const platform = conn.platform as 'twitch' | 'youtube' | 'kick';
      if (platformStatuses[platform]) {
        platformStatuses[platform].total++;
        if (conn.isConnected) {
          platformStatuses[platform].connected++;
        }
      }
    }

    health.platforms.twitch = {
      status: platformStatuses.twitch.connected > 0 ? 'connected' : 'disconnected',
      connections: platformStatuses.twitch.connected,
      total: platformStatuses.twitch.total
    };
    
    health.platforms.youtube = {
      status: platformStatuses.youtube.connected > 0 ? 'connected' : 'disconnected',
      connections: platformStatuses.youtube.connected,
      total: platformStatuses.youtube.total
    };
    
    health.platforms.kick = {
      status: platformStatuses.kick.connected > 0 ? 'connected' : 'disconnected',
      connections: platformStatuses.kick.connected,
      total: platformStatuses.kick.total
    };
  } catch (error: any) {
    console.error('[Health] Platform connections check failed:', error.message);
  }

  // Get memory usage
  const memUsage = process.memoryUsage();
  health.memory.used = memUsage.heapUsed;
  health.memory.total = memUsage.heapTotal;
  health.memory.percentage = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

  // Check memory threshold
  if (health.memory.percentage > 90) {
    health.status = 'degraded';
    console.warn('[Health] High memory usage:', health.memory.percentage + '%');
  }

  // Overall health status
  if (health.dependencies.database.status === 'down') {
    health.status = 'unhealthy';
    console.error('[Health] Critical dependency (database) is down');
  }

  return health;
}
