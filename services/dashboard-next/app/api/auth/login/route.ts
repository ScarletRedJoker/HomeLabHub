import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createSession, isSessionSecretConfigured } from "@/lib/session";
import { userService } from "@/lib/services/user-service";
import { auditService } from "@/lib/services/audit-service";
import { getClientIp } from "@/lib/middleware/permissions";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export async function POST(request: NextRequest) {
  try {
    if (!isSessionSecretConfigured()) {
      console.error("SESSION_SECRET is not configured or is too short (minimum 32 characters)");
      return NextResponse.json(
        { error: "Server configuration error: session signing not configured" },
        { status: 500 }
      );
    }

    const { username, password } = await request.json();
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || undefined;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    let authenticatedUser = null;
    try {
      authenticatedUser = await userService.verifyPassword(username, password);
    } catch (dbErr) {
      console.warn("Database user lookup failed, falling back to env credentials:", dbErr);
    }
    
    if (authenticatedUser) {
      await auditService.log({
        userId: authenticatedUser.id,
        username: authenticatedUser.username,
        action: "user.login",
        resource: "auth",
        details: { method: "database" },
        ipAddress,
        userAgent,
        status: "success",
      });
      
      const sessionToken = await createSession(
        authenticatedUser.username, 
        authenticatedUser.id, 
        authenticatedUser.role
      );
      const cookieStore = await cookies();
      cookieStore.set("session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      
      return NextResponse.json({ 
        success: true,
        user: {
          id: authenticatedUser.id,
          username: authenticatedUser.username,
          role: authenticatedUser.role,
        }
      });
    }

    if (ADMIN_USERNAME && (ADMIN_PASSWORD_HASH || ADMIN_PASSWORD)) {
      if (username === ADMIN_USERNAME) {
        let isValidPassword = false;
        if (ADMIN_PASSWORD_HASH) {
          isValidPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        } else if (ADMIN_PASSWORD) {
          isValidPassword = password === ADMIN_PASSWORD;
        }
        
        if (isValidPassword) {
          await auditService.log({
            username,
            action: "user.login",
            resource: "auth",
            details: { method: "env_fallback" },
            ipAddress,
            userAgent,
            status: "success",
          });
          
          const sessionToken = await createSession(username);
          const cookieStore = await cookies();
          cookieStore.set("session", sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60,
            path: "/",
          });

          return NextResponse.json({ 
            success: true,
            user: { username, role: "admin" }
          });
        }
      }
    }

    await auditService.log({
      username,
      action: "user.login",
      resource: "auth",
      details: { reason: "invalid_credentials" },
      ipAddress,
      userAgent,
      status: "failure",
    });

    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
