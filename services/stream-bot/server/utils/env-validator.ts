/**
 * Environment Variable Validator for Stream Bot
 * 
 * Validates required and optional environment variables at startup.
 * In production mode, missing required secrets cause immediate exit.
 * In development mode, warnings are logged but startup continues.
 * 
 * Security: Logs secret names and presence status, never exposes values.
 */

import { getEnv } from '../env';

const REQUIRED_SECRETS = [
  'SESSION_SECRET',
] as const;

const REQUIRED_EITHER_OR = [
  { keys: ['DATABASE_URL', 'STREAMBOT_DATABASE_URL'], description: 'database connection string' },
] as const;

const PLATFORM_OAUTH_SECRETS = [
  { platform: 'Twitch', keys: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_REDIRECT_URI'] },
  { platform: 'YouTube', keys: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REDIRECT_URI'] },
  { platform: 'Spotify', keys: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI'] },
  { platform: 'Kick', keys: ['KICK_CLIENT_ID', 'KICK_CLIENT_SECRET'], optional: true },
] as const;

const OPTIONAL_SECRETS = [
  'OPENAI_API_KEY',
  'DISCORD_WEBHOOK_URL',
  'DASHBOARD_REGISTRY_URL',
  'OBS_WEBSOCKET_URL',
  'OBS_WEBSOCKET_PASSWORD',
] as const;

export interface ValidationResult {
  valid: boolean;
  missingRequired: string[];
  missingOptional: string[];
  loadedSecrets: string[];
  platformStatus: Record<string, { configured: boolean; missing: string[] }>;
}

function maskValue(value: string): string {
  if (value.length <= 8) return '****';
  return value.substring(0, 4) + '****' + value.substring(value.length - 4);
}

export function validateEnvironment(): ValidationResult {
  const nodeEnv = getEnv('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const loadedSecrets: string[] = [];
  const platformStatus: Record<string, { configured: boolean; missing: string[] }> = {};
  
  console.log('\n' + '='.repeat(60));
  console.log('Stream Bot Environment Validation');
  console.log('='.repeat(60));
  console.log(`Environment: ${nodeEnv}`);
  console.log('-'.repeat(60));
  
  console.log('\n[Required Secrets]');
  for (const secret of REQUIRED_SECRETS) {
    const value = getEnv(secret);
    if (value) {
      loadedSecrets.push(secret);
      console.log(`  ✓ ${secret}: loaded (${maskValue(value)})`);
    } else {
      missingRequired.push(secret);
      console.log(`  ✗ ${secret}: MISSING`);
    }
  }
  
  console.log('\n[Required Either/Or]');
  for (const { keys, description } of REQUIRED_EITHER_OR) {
    const foundKey = keys.find(key => !!getEnv(key) || !!process.env[key]);
    if (foundKey) {
      loadedSecrets.push(foundKey);
      console.log(`  ✓ ${description}: ${foundKey} loaded`);
    } else {
      missingRequired.push(`${keys.join(' or ')} (${description})`);
      console.log(`  ✗ ${description}: MISSING (need ${keys.join(' or ')})`);
    }
  }
  
  console.log('\n[Platform OAuth Status]');
  for (const platform of PLATFORM_OAUTH_SECRETS) {
    const missing = platform.keys.filter(key => !getEnv(key));
    const isOptional = (platform as any).optional === true;
    const configured = missing.length === 0;
    
    platformStatus[platform.platform] = { configured, missing: [...missing] };
    
    if (configured) {
      loadedSecrets.push(...platform.keys);
      console.log(`  ✓ ${platform.platform}: fully configured`);
    } else if (isOptional) {
      console.log(`  ○ ${platform.platform}: not configured (optional)`);
    } else {
      console.log(`  ⚠ ${platform.platform}: missing ${missing.join(', ')}`);
    }
  }
  
  console.log('\n[Optional Secrets]');
  for (const secret of OPTIONAL_SECRETS) {
    const value = getEnv(secret);
    if (value) {
      loadedSecrets.push(secret);
      console.log(`  ○ ${secret}: loaded`);
    } else {
      missingOptional.push(secret);
      console.log(`  - ${secret}: not configured`);
    }
  }
  
  console.log('\n' + '-'.repeat(60));
  
  if (missingRequired.length > 0) {
    const errorMsg = `Missing required environment variables: ${missingRequired.join(', ')}`;
    if (isProduction) {
      console.error('FATAL: Environment validation failed!');
      console.error(errorMsg);
      console.error('Stream Bot cannot start without these secrets in production mode.');
      console.error('='.repeat(60) + '\n');
      process.exit(1);
    } else {
      console.warn('WARNING: Environment validation failed!');
      console.warn(errorMsg);
      console.warn('Continuing in development mode...');
    }
  } else {
    console.log(`✓ All ${loadedSecrets.length} required secrets loaded successfully`);
  }
  
  const configuredPlatforms = Object.entries(platformStatus)
    .filter(([, status]) => status.configured)
    .map(([name]) => name);
  console.log(`✓ Configured platforms: ${configuredPlatforms.length > 0 ? configuredPlatforms.join(', ') : 'none'}`);
  
  console.log('='.repeat(60) + '\n');
  
  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    loadedSecrets,
    platformStatus,
  };
}
