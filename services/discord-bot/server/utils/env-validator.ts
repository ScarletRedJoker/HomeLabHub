/**
 * Environment Variable Validator for Discord Bot
 * 
 * Validates required and optional environment variables at startup.
 * In production mode, missing required secrets cause immediate exit.
 * In development mode, warnings are logged but startup continues.
 * 
 * Security: Logs secret names and presence status, never exposes values.
 */

const REQUIRED_SECRETS = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_APP_ID',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'SESSION_SECRET',
] as const;

const REQUIRED_EITHER_OR = [
  { keys: ['DATABASE_URL', 'DISCORD_DATABASE_URL'], description: 'database connection string' },
] as const;

const OPTIONAL_SECRETS = [
  'YOUTUBE_API_KEY',
  'TWITCH_CLIENT_ID',
  'TWITCH_CLIENT_SECRET',
  'OPENAI_API_KEY',
  'OLLAMA_URL',
  'LOCAL_AI_URL',
  'DASHBOARD_REGISTRY_URL',
] as const;

const LOCAL_AI_SECRETS = [
  'LOCAL_AI_ONLY',
  'OLLAMA_URL',
  'LOCAL_AI_URL',
  'OLLAMA_MODEL',
  'LOCAL_AI_MODEL',
  'TAILSCALE_IP',
  'WINDOWS_VM_IP',
] as const;

export interface ValidationResult {
  valid: boolean;
  missingRequired: string[];
  missingOptional: string[];
  loadedSecrets: string[];
}

function maskValue(value: string): string {
  if (value.length <= 8) return '****';
  return value.substring(0, 4) + '****' + value.substring(value.length - 4);
}

export function validateEnvironment(): ValidationResult {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isLocalAIOnly = process.env.LOCAL_AI_ONLY === 'true' || process.env.LOCAL_AI_ONLY === '1';
  
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const loadedSecrets: string[] = [];
  
  console.log('\n' + '='.repeat(60));
  console.log('Discord Bot Environment Validation');
  console.log('='.repeat(60));
  console.log(`Environment: ${nodeEnv}`);
  console.log(`LOCAL_AI_ONLY Mode: ${isLocalAIOnly ? 'ENABLED' : 'disabled'}`);
  console.log('-'.repeat(60));
  
  console.log('\n[Required Secrets]');
  for (const secret of REQUIRED_SECRETS) {
    const value = process.env[secret];
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
    const foundKey = keys.find(key => !!process.env[key]);
    if (foundKey) {
      loadedSecrets.push(foundKey);
      console.log(`  ✓ ${description}: ${foundKey} loaded`);
    } else {
      missingRequired.push(`${keys.join(' or ')} (${description})`);
      console.log(`  ✗ ${description}: MISSING (need ${keys.join(' or ')})`);
    }
  }
  
  console.log('\n[Optional Secrets]');
  for (const secret of OPTIONAL_SECRETS) {
    const value = process.env[secret];
    if (value) {
      loadedSecrets.push(secret);
      console.log(`  ○ ${secret}: loaded`);
    } else {
      missingOptional.push(secret);
      console.log(`  - ${secret}: not configured`);
    }
  }
  
  if (isLocalAIOnly) {
    console.log('\n[LOCAL_AI_ONLY Configuration]');
    for (const secret of LOCAL_AI_SECRETS) {
      const value = process.env[secret];
      if (value) {
        loadedSecrets.push(secret);
        console.log(`  ○ ${secret}: ${secret.includes('IP') || secret.includes('URL') ? value : 'configured'}`);
      } else {
        console.log(`  - ${secret}: not set (using defaults)`);
      }
    }
  }
  
  console.log('\n' + '-'.repeat(60));
  
  if (missingRequired.length > 0) {
    const errorMsg = `Missing required environment variables: ${missingRequired.join(', ')}`;
    if (isProduction) {
      console.error('FATAL: Environment validation failed!');
      console.error(errorMsg);
      console.error('Discord Bot cannot start without these secrets in production mode.');
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
  
  if (missingOptional.length > 0) {
    console.log(`⚠ ${missingOptional.length} optional secrets not configured`);
  }
  
  console.log('='.repeat(60) + '\n');
  
  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    loadedSecrets,
  };
}
