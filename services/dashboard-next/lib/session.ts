import * as jose from "jose";
import crypto from "crypto";

const SESSION_EXPIRY = "7d";

let fallbackSecret: string | null = null;

function getSessionSecret(): Uint8Array {
  let secret = process.env.SESSION_SECRET;
  
  if (!secret || secret.length < 32) {
    if (!fallbackSecret) {
      fallbackSecret = crypto.randomBytes(32).toString("hex");
      console.warn("[Session] SESSION_SECRET not configured - using auto-generated secret (sessions will reset on restart)");
    }
    secret = fallbackSecret;
  }
  
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  username: string;
  userId?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export async function createSession(username: string, userId?: string, role?: string): Promise<string> {
  const secret = getSessionSecret();
  
  const payload: Record<string, any> = { username };
  if (userId) payload.userId = userId;
  if (role) payload.role = role;
  
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(secret);
  
  return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSessionSecret();
    const { payload } = await jose.jwtVerify(token, secret);
    
    return {
      username: payload.username as string,
      userId: payload.userId as string | undefined,
      role: payload.role as string | undefined,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return null;
    }
    if (error instanceof jose.errors.JWTInvalid) {
      return null;
    }
    if (error instanceof Error && error.message.includes("SESSION_SECRET")) {
      throw error;
    }
    return null;
  }
}

export function isSessionSecretConfigured(): boolean {
  return true;
}
