import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { execFileSync } from "child_process";
import { Client } from "ssh2";
import * as path from "path";

const DEFAULT_SSH_KEY_PATH = process.env.SSH_KEY_PATH || 
  (process.env.REPL_ID ? `${process.env.HOME}/.ssh/homelab` : "/root/.ssh/homelab");

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

function sanitizeForShell(input: string): string {
  return input.replace(/[^a-zA-Z0-9@._-]/g, "");
}

function isValidHostname(host: string): boolean {
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return hostnameRegex.test(host) || ipv4Regex.test(host);
}

function isValidUsername(user: string): boolean {
  return /^[a-z_]([a-z0-9_-]{0,30}[a-z0-9_$-]?)$/.test(user);
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = request.nextUrl.searchParams.get("action") || "status";

  try {
    const keyPath = DEFAULT_SSH_KEY_PATH;
    const publicKeyPath = `${keyPath}.pub`;
    const keyExists = existsSync(keyPath) && existsSync(publicKeyPath);

    if (action === "status") {
      let publicKey = null;
      let fingerprint = null;

      if (keyExists) {
        publicKey = readFileSync(publicKeyPath, "utf-8").trim();
        try {
          fingerprint = execFileSync("ssh-keygen", ["-lf", publicKeyPath], { 
            encoding: "utf-8",
            timeout: 5000
          }).trim();
        } catch {
          fingerprint = "Unable to read fingerprint";
        }
      }

      return NextResponse.json({
        exists: keyExists,
        keyPath,
        publicKey,
        fingerprint,
        environment: process.env.REPL_ID ? "replit" : "production",
        instructions: keyExists ? 
          "Add this public key to ~/.ssh/authorized_keys on your remote servers to enable SSH access." :
          "Generate an SSH key using the POST endpoint or configure SSH_KEY_PATH environment variable.",
      });
    }

    if (action === "public-key") {
      if (!keyExists) {
        return NextResponse.json({ 
          error: "SSH key not found",
          keyPath,
          hint: "Generate a key first using POST /api/ssh?action=generate"
        }, { status: 404 });
      }

      const publicKey = readFileSync(publicKeyPath, "utf-8").trim();
      return NextResponse.json({ publicKey });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("SSH API error:", error);
    return NextResponse.json(
      { error: "SSH operation failed", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action || "generate";

  try {
    const keyPath = DEFAULT_SSH_KEY_PATH;
    const publicKeyPath = `${keyPath}.pub`;

    if (action === "generate") {
      if (existsSync(keyPath) && !body.force) {
        return NextResponse.json({ 
          error: "SSH key already exists",
          hint: "Set force: true to overwrite"
        }, { status: 400 });
      }

      const sshDir = path.dirname(keyPath);
      if (!existsSync(sshDir)) {
        mkdirSync(sshDir, { recursive: true, mode: 0o700 });
      }

      const rawComment = body.comment || `nebula-${new Date().toISOString().split("T")[0]}`;
      const comment = sanitizeForShell(rawComment);
      
      try {
        execFileSync("ssh-keygen", ["-t", "ed25519", "-f", keyPath, "-N", "", "-C", comment, "-q"], {
          stdio: "pipe",
          timeout: 30000
        });
        chmodSync(keyPath, 0o600);
        chmodSync(publicKeyPath, 0o644);
      } catch (err: any) {
        return NextResponse.json({ 
          error: "Failed to generate SSH key",
          details: err.message
        }, { status: 500 });
      }

      const publicKey = readFileSync(publicKeyPath, "utf-8").trim();
      let fingerprint = null;
      try {
        fingerprint = execFileSync("ssh-keygen", ["-lf", publicKeyPath], {
          encoding: "utf-8",
          timeout: 5000
        }).trim();
      } catch {}

      return NextResponse.json({
        success: true,
        message: "SSH key generated successfully",
        keyPath,
        publicKey,
        fingerprint,
        instructions: "Add this public key to ~/.ssh/authorized_keys on your remote servers."
      });
    }

    if (action === "test") {
      const { host, user } = body;
      const port = parseInt(body.port, 10) || 22;
      
      if (!host || !user) {
        return NextResponse.json({ error: "host and user are required" }, { status: 400 });
      }

      if (!isValidHostname(host)) {
        return NextResponse.json({ error: "Invalid hostname" }, { status: 400 });
      }

      if (!isValidUsername(user)) {
        return NextResponse.json({ error: "Invalid username" }, { status: 400 });
      }

      if (!isValidPort(port)) {
        return NextResponse.json({ error: "Invalid port number" }, { status: 400 });
      }

      if (!existsSync(keyPath)) {
        return NextResponse.json({ 
          error: "SSH key not found",
          hint: "Generate a key first"
        }, { status: 400 });
      }

      return new Promise<Response>((resolve) => {
        const conn = new Client();
        const timeout = setTimeout(() => {
          conn.end();
          resolve(NextResponse.json({
            success: false,
            host,
            user,
            error: "Connection timeout"
          }));
        }, 15000);

        conn.on("ready", () => {
          clearTimeout(timeout);
          conn.end();
          resolve(NextResponse.json({
            success: true,
            host,
            user,
            message: "SSH connection successful"
          }));
        });

        conn.on("error", (err) => {
          clearTimeout(timeout);
          resolve(NextResponse.json({
            success: false,
            host,
            user,
            error: "SSH connection failed",
            details: err.message
          }));
        });

        try {
          const privateKey = readFileSync(keyPath);
          conn.connect({
            host,
            port,
            username: user,
            privateKey,
            readyTimeout: 10000,
          });
        } catch (err: any) {
          clearTimeout(timeout);
          resolve(NextResponse.json({
            success: false,
            host,
            user,
            error: "Failed to initiate connection",
            details: err.message
          }));
        }
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("SSH API POST error:", error);
    return NextResponse.json(
      { error: "SSH operation failed", details: error.message },
      { status: 500 }
    );
  }
}
