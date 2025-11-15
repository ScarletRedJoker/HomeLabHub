import { pool } from "./db";
import { botManager } from "./bot-manager";
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'stream-bot' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, component, ...metadata }) => {
          let msg = `${timestamp} [${service}]${component ? `[${component}]` : ''} ${level}: ${message}`;
          if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
          }
          return msg;
        })
      )
    })
  ]
});

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
  const startTime = Date.now();
  
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
    
    logger.debug('Database health check passed', {
      component: 'health',
      latency: health.dependencies.database.latency
    });
  } catch (error: any) {
    health.dependencies.database.status = 'down';
    health.dependencies.database.error = error.message;
    health.status = 'degraded';
    
    logger.error('Database health check failed', {
      component: 'health',
      error: error.message,
      stack: error.stack
    });
  }

  // Check bot manager status
  try {
    const managerStats = botManager.getStats();
    health.dependencies.bot.totalWorkers = managerStats.totalWorkers;
    health.dependencies.bot.activeWorkers = managerStats.activeWorkers;
    health.dependencies.bot.status = managerStats.activeWorkers > 0 ? 'operational' : 'idle';
    
    logger.debug('Bot manager health check passed', {
      component: 'health',
      totalWorkers: managerStats.totalWorkers,
      activeWorkers: managerStats.activeWorkers
    });
  } catch (error: any) {
    health.dependencies.bot.status = 'down';
    health.dependencies.bot.error = error.message;
    health.status = 'degraded';
    
    logger.error('Bot manager health check failed', {
      component: 'health',
      error: error.message,
      stack: error.stack
    });
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
    
    logger.debug('Platform connections checked', {
      component: 'health',
      twitch: platformStatuses.twitch.connected,
      youtube: platformStatuses.youtube.connected,
      kick: platformStatuses.kick.connected
    });
  } catch (error: any) {
    logger.error('Platform connections check failed', {
      component: 'health',
      error: error.message,
      stack: error.stack
    });
  }

  // Get memory usage
  const memUsage = process.memoryUsage();
  health.memory.used = memUsage.heapUsed;
  health.memory.total = memUsage.heapTotal;
  health.memory.percentage = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

  // Check memory threshold
  if (health.memory.percentage > 90) {
    health.status = 'degraded';
    logger.warn('High memory usage detected', {
      component: 'health',
      percentage: health.memory.percentage
    });
  }

  // Overall health status
  if (health.dependencies.database.status === 'down') {
    health.status = 'unhealthy';
    logger.error('Critical dependency (database) is down', {
      component: 'health'
    });
  }

  const duration = Date.now() - startTime;
  logger.info('Health check completed', {
    component: 'health',
    status: health.status,
    duration
  });

  return health;
}

export { logger };
