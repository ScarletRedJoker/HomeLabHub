import { db } from "./db";
import { getDiscordClient } from "./discord/bot";
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'discord-bot' },
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
    discord: {
      status: 'up' | 'down';
      latency?: number;
      guilds?: number;
      users?: number;
      error?: string;
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
    service: 'discord-bot',
    version: process.env.npm_package_version || '1.0.0',
    dependencies: {
      database: {
        status: 'down'
      },
      discord: {
        status: 'down'
      }
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
    await db.execute({ sql: 'SELECT 1' });
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

  // Check Discord bot connection
  try {
    const client = getDiscordClient();
    
    if (!client) {
      throw new Error('Discord client not initialized');
    }

    if (client.isReady()) {
      health.dependencies.discord.status = 'up';
      health.dependencies.discord.latency = client.ws.ping;
      health.dependencies.discord.guilds = client.guilds.cache.size;
      
      let totalUsers = 0;
      client.guilds.cache.forEach(guild => {
        totalUsers += guild.memberCount;
      });
      health.dependencies.discord.users = totalUsers;
      
      // Check if latency is too high
      if (client.ws.ping > 200) {
        health.status = 'degraded';
        logger.warn('Discord API latency high', {
          component: 'health',
          latency: client.ws.ping
        });
      }
      
      logger.debug('Discord health check passed', {
        component: 'health',
        latency: client.ws.ping,
        guilds: health.dependencies.discord.guilds,
        users: totalUsers
      });
    } else {
      throw new Error('Discord client not ready');
    }
  } catch (error: any) {
    health.dependencies.discord.status = 'down';
    health.dependencies.discord.error = error.message;
    health.status = 'degraded';
    
    logger.error('Discord health check failed', {
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
  if (health.dependencies.database.status === 'down' && health.dependencies.discord.status === 'down') {
    health.status = 'unhealthy';
    logger.error('Multiple critical dependencies down', {
      component: 'health',
      database: health.dependencies.database.status,
      discord: health.dependencies.discord.status
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
