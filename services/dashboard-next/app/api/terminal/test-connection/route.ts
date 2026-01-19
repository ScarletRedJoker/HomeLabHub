import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFileSync, existsSync } from "fs";
import { detectSSHKeyFormat } from "@/lib/ssh-key-converter";
import { getAllServers } from "@/lib/server-config-store";
import { createConnection } from "net";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface ServerTest {
  name: string;
  host: string;
  port: number;
  reachable: boolean;
  error: string | null;
  duration?: number;
}

interface TestConnectionResponse {
  keyAvailable: boolean;
  keyFormat: string;
  formatSupported: boolean;
  conversionNeeded: boolean;
  conversionCommand: string | null;
  keySource: string | null;
  servers: ServerTest[];
  timestamp: string;
}

const DEFAULT_SSH_KEY_PATH = process.env.SSH_KEY_PATH ||
  (process.env.REPL_ID ? `${process.env.HOME}/.ssh/homelab` : "/root/.ssh/homelab");

// Supported SSH key formats for ssh2 library
const SUPPORTED_FORMATS = ["PKCS8", "RSA", "EC", "ED25519"];

function getSSHKeyAndFormat(): { key: Buffer | null; format: string; source: string | null } {
  let keyBuffer: Buffer | null = null;
  let source: string | null = null;

  // Try environment variable first
  if (process.env.SSH_PRIVATE_KEY) {
    try {
      keyBuffer = Buffer.from(process.env.SSH_PRIVATE_KEY);
      source = "SSH_PRIVATE_KEY environment variable";
    } catch (err) {
      console.error("[SSH Test] Failed to parse SSH_PRIVATE_KEY from environment:", err);
    }
  }

  // Fall back to file
  if (!keyBuffer) {
    const keyPath = DEFAULT_SSH_KEY_PATH;
    if (existsSync(keyPath)) {
      try {
        keyBuffer = readFileSync(keyPath);
        source = `SSH key file (${keyPath})`;
      } catch (err: any) {
        console.error(`[SSH Test] Failed to read SSH key from file: ${err.message}`);
      }
    }
  }

  let format = "Unknown";
  if (keyBuffer) {
    format = detectSSHKeyFormat(keyBuffer);
  }

  return { key: keyBuffer, format, source };
}

async function testServerConnectivity(
  host: string,
  port: number = 22,
  timeoutMs: number = 5000
): Promise<{ reachable: boolean; error: string | null; duration: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = createConnection({ host, port, timeout: timeoutMs });
    let connected = false;

    const cleanup = () => {
      socket.destroy();
    };

    socket.on("connect", () => {
      connected = true;
      cleanup();
      const duration = Date.now() - startTime;
      resolve({ reachable: true, error: null, duration });
    });

    socket.on("error", (err: any) => {
      const duration = Date.now() - startTime;
      let errorMsg = err.message;
      if (err.code === "ECONNREFUSED") {
        errorMsg = "Connection refused";
      } else if (err.code === "ETIMEDOUT" || err.code === "EHOSTUNREACH") {
        errorMsg = "Timeout or host unreachable";
      }
      resolve({ reachable: false, error: errorMsg, duration });
    });

    socket.on("timeout", () => {
      cleanup();
      const duration = Date.now() - startTime;
      resolve({ reachable: false, error: "Connection timeout", duration });
    });
  });
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { key, format, source } = getSSHKeyAndFormat();
    const keyAvailable = key !== null;
    const formatSupported = SUPPORTED_FORMATS.includes(format);
    const conversionNeeded = format === "OpenSSH";

    let conversionCommand: string | null = null;
    if (conversionNeeded) {
      conversionCommand = "ssh-keygen -p -m pem -f ~/.ssh/your_key";
    }

    // Test connectivity to configured servers
    const serverConfigs = await getAllServers();
    const serverTests: ServerTest[] = [];

    for (const serverConfig of serverConfigs) {
      if (!serverConfig.host) continue;

      const { reachable, error, duration } = await testServerConnectivity(
        serverConfig.host,
        serverConfig.port || 22
      );

      serverTests.push({
        name: serverConfig.name,
        host: serverConfig.host,
        port: serverConfig.port || 22,
        reachable,
        error,
        duration,
      });
    }

    const response: TestConnectionResponse = {
      keyAvailable,
      keyFormat: format,
      formatSupported,
      conversionNeeded,
      conversionCommand,
      keySource: source,
      servers: serverTests,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[SSH Test] Error during test:", error);
    return NextResponse.json(
      {
        keyAvailable: false,
        keyFormat: "Unknown",
        formatSupported: false,
        conversionNeeded: false,
        conversionCommand: null,
        keySource: null,
        servers: [],
        timestamp: new Date().toISOString(),
        error: error.message,
      },
      { status: 500 }
    );
  }
}
