import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createSession, isSessionSecretConfigured } from "@/lib/session";
import { userService } from "@/lib/services/user-service";
import { getClientIp } from "@/lib/middleware/permissions";

export async function POST(request: NextRequest) {
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  try {
    if (!isSessionSecretConfigured()) {
      console.error("[Login] SESSION_SECRET is not configured or is too short");
      return NextResponse.json(
        { error: "SESSION_SECRET not configured. Add it to your .env file (min 32 chars)." },
        { status: 500 }
      );
    }

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    console.log(`[Login] Attempting login for: ${username}`);

    let authenticatedUser = null;
    try {
      authenticatedUser = await userService.verifyPassword(username, password);
    } catch (dbErr: any) {
      console.warn("[Login] Database lookup failed:", dbErr.message);
    }
    
    if (authenticatedUser) {
      console.log(`[Login] Database auth success for: ${username}`);
      
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
      console.log(`[Login] Checking env credentials for: ${username}`);
      
      if (username === ADMIN_USERNAME) {
        let isValidPassword = false;
        if (ADMIN_PASSWORD_HASH) {
          isValidPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        } else if (ADMIN_PASSWORD) {
          isValidPassword = password === ADMIN_PASSWORD;
        }
        
        if (isValidPassword) {
          console.log(`[Login] Env auth success for: ${username}`);
          
          const sessionToken = await createSession(username, undefined, "admin");
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

    console.log(`[Login] Failed login for: ${username}`);
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  } catch (error: any) {
    console.error("[Login] Error:", error.message, error.stack);
    return NextResponse.json(
      { error: `Login failed: ${error.message}` },
      { status: 500 }
    );
  }
}
