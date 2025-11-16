/**
 * Environment Configuration for Stream Bot
 * Auto-detects Replit vs Ubuntu and applies appropriate settings
 */
import { existsSync } from 'fs';

// Environment Detection
export const IS_REPLIT = existsSync('/home/runner') || process.env.REPLIT_WORKSPACE !== undefined;
export const IS_UBUNTU = !IS_REPLIT;

export interface EnvironmentConfig {
  environment: 'replit' | 'ubuntu';
  demoMode: boolean;
  databaseUrl: string;
  redisEnabled: boolean;
  port: number;
}

// Create and export the ACTUAL config that will be used
export const ENV_CONFIG: EnvironmentConfig = {
  environment: IS_REPLIT ? 'replit' : 'ubuntu',
  demoMode: process.env.DEMO_MODE?.toLowerCase() === 'true' || IS_REPLIT,
  databaseUrl: process.env.DATABASE_URL || '',
  redisEnabled: !IS_REPLIT, // Disable Redis on Replit
  port: parseInt(process.env.PORT || (IS_REPLIT ? '3000' : '5000'), 10)
};

export const logEnvironmentConfig = () => {
  console.log('============================================================');
  console.log('🌍 Stream Bot - Environment Detected:', ENV_CONFIG.environment);
  console.log('📊 Configuration Summary:');
  console.log('  environment:', ENV_CONFIG.environment);
  console.log('  demo_mode:', ENV_CONFIG.demoMode);
  console.log('  database:', ENV_CONFIG.databaseUrl ? '[Connected]' : '[Not Configured]');
  console.log('  redis_enabled:', ENV_CONFIG.redisEnabled);
  console.log('  port:', ENV_CONFIG.port);
  console.log('============================================================');
};
