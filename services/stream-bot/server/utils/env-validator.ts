/**
 * Environment Variable Validator for Stream Bot
 * 
 * Validates required and optional environment variables at startup.
 * In production mode, missing required secrets cause immediate exit.
 * In development mode, warnings are logged but startup continues.
 */

import { getEnv } from '../env';

const REQUIRED_SECRETS = [
  'SESSION_SECRET',
] as const;

const REQUIRED_EITHER_OR = [
  { keys: ['DATABASE_URL', 'STREAMBOT_DATABASE_URL'], description: 'database connection string' },
] as const;

const OPTIONAL_SECRETS = [
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
] as const;

export interface ValidationResult {
  valid: boolean;
  missingRequired: string[];
  missingOptional: string[];
}

export function validateEnvironment(): ValidationResult {
  const nodeEnv = getEnv('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  
  for (const secret of REQUIRED_SECRETS) {
    if (!getEnv(secret)) {
      missingRequired.push(secret);
    }
  }
  
  for (const { keys, description } of REQUIRED_EITHER_OR) {
    const hasAny = keys.some(key => !!getEnv(key) || !!process.env[key]);
    if (!hasAny) {
      missingRequired.push(`${keys.join(' or ')} (${description})`);
    }
  }
  
  for (const secret of OPTIONAL_SECRETS) {
    if (!getEnv(secret)) {
      missingOptional.push(secret);
    }
  }
  
  if (missingRequired.length > 0) {
    const errorMsg = `Missing required environment variables: ${missingRequired.join(', ')}`;
    if (isProduction) {
      console.error('='.repeat(60));
      console.error('FATAL: Environment validation failed!');
      console.error(errorMsg);
      console.error('Stream Bot cannot start without these secrets in production mode.');
      console.error('='.repeat(60));
      process.exit(1);
    } else {
      console.warn('='.repeat(60));
      console.warn('WARNING: Environment validation failed!');
      console.warn(errorMsg);
      console.warn('Continuing in development mode...');
      console.warn('='.repeat(60));
    }
  }
  
  if (missingOptional.length > 0) {
    console.log(`Optional secrets not configured: ${missingOptional.join(', ')}`);
    console.log('Some features may be unavailable.');
  }
  
  if (missingRequired.length === 0) {
    console.log('✓ Environment validation passed: All required secrets present.');
  }
  
  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingOptional,
  };
}
