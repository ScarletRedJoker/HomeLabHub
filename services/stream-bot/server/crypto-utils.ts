import crypto from 'crypto';
import { getEnv } from './env';

// Get encryption key from session secret
function getEncryptionKey(): Buffer {
  const secret = getEnv('SESSION_SECRET');
  if (!secret) {
    throw new Error('SESSION_SECRET not set - cannot encrypt tokens');
  }
  // Derive a 32-byte key from the session secret
  return crypto.scryptSync(secret, 'stream-bot-salt', 32);
}

/**
 * Encrypt sensitive data (like OAuth tokens) using AES-256-GCM
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt encrypted data
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
  
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted token format');
  }
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate a cryptographically secure random state parameter for OAuth
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code verifier
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

/**
 * Create a signed JWT-like token for overlay access
 * Format: {userId}.{expiry}.{signature}
 */
export function createOverlayToken(userId: string, expiresInSeconds: number = 86400): string {
  const expiry = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${userId}.${expiry}`;
  
  const secret = getEnv('SESSION_SECRET');
  if (!secret) {
    throw new Error('SESSION_SECRET not set - cannot sign overlay token');
  }
  
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  
  return `${payload}.${signature}`;
}

/**
 * Verify and decode overlay token
 * Returns userId if valid, throws if invalid/expired
 */
export function verifyOverlayToken(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid overlay token format');
  }
  
  const [userId, expiryStr, signature] = parts;
  const expiry = parseInt(expiryStr, 10);
  const now = Math.floor(Date.now() / 1000);
  
  if (now > expiry) {
    throw new Error('Overlay token expired');
  }
  
  const payload = `${userId}.${expiryStr}`;
  const secret = getEnv('SESSION_SECRET');
  if (!secret) {
    throw new Error('SESSION_SECRET not set - cannot verify overlay token');
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  
  if (signature !== expectedSignature) {
    throw new Error('Invalid overlay token signature');
  }
  
  return userId;
}
