import { WebSocketServer, WebSocket } from "ws";
import { Client, ClientChannel } from "ssh2";
import { createServer, IncomingMessage } from "http";
import { parse } from "url";
import { readFileSync, existsSync } from "fs";
import { jwtVerify } from "jose";
import { convertSSHKeyToPEM, detectSSHKeyFormat } from "../lib/ssh-key-converter";

interface ServerConfig {
  id: string;
  name: string;
  host: string;
  user: string;
  keyPath: string;
}

const DEFAULT_SSH_KEY_PATH = process.env.SSH_KEY_PATH || 
  (process.env.REPL_ID ? `${process.env.HOME}/.ssh/homelab` : "/root/.ssh/homelab");

function getSSHPrivateKey(): { key: Buffer | null; format: string; error?: string } {
  let rawKey: Buffer | null = null;
  let source = "unknown";

  // Try to get key from environment variable first
  if (process.env.SSH_PRIVATE_KEY) {
    rawKey = Buffer.from(process.env.SSH_PRIVATE_KEY);
    source = "SSH_PRIVATE_KEY env var";
  } else {
    // Try to read from file
    const keyPath = DEFAULT_SSH_KEY_PATH;
    if (existsSync(keyPath)) {
      try {
        rawKey = readFileSync(keyPath);
        source = `file (${keyPath})`;
      } catch (err: any) {
        console.error(`[SSH] Failed to read SSH key from file: ${err.message}`);
        return {
          key: null,
          format: "error",
          error: `Failed to read SSH key from ${keyPath}: ${err.message}`,
        };
      }
    } else {
      console.warn("[SSH] SSH private key not found");
      console.warn("[SSH] Expected key in SSH_PRIVATE_KEY secret or at " + keyPath);
      return {
        key: null,
        format: "error",
        error: "SSH private key not configured. Please set SSH_PRIVATE_KEY secret or place key at " + keyPath,
      };
    }
  }

  if (!rawKey) {
    return {
      key: null,
      format: "error",
      error: "SSH private key is empty",
    };
  }

  // Detect the key format
  const format = detectSSHKeyFormat(rawKey);
  console.log(`[SSH] Detected SSH key format: ${format} (from ${source})`);

  // Try to convert if necessary
  const convertedKey = convertSSHKeyToPEM(rawKey);

  if (convertedKey) {
    return {
      key: convertedKey,
      format: format,
    };
  }

  // Conversion failed or key is not in OpenSSH format but also not in a supported PEM format
  if (format === "OpenSSH") {
    console.error("[SSH] OpenSSH format key detected but automatic conversion failed");
    console.error("[SSH] Please convert your SSH key to PEM format manually:");
    console.error("[SSH] Run: ssh-keygen -p -m pem -f /path/to/your/key");
    console.error("[SSH] Or generate a new key in PEM format:");
    console.error("[SSH] Run: ssh-keygen -t rsa -m pem -f ~/.ssh/id_rsa_pem -N \"\"");
    return {
      key: null,
      format: format,
      error: "SSH key is in OpenSSH format which is not supported. Please convert to PEM format using: ssh-keygen -p -m pem -f /path/to/key",
    };
  }

  if (format === "Unknown PEM format" || format === "Raw/Binary format") {
    console.error(`[SSH] SSH key format is not supported: ${format}`);
    return {
      key: null,
      format: format,
      error: `SSH key format "${format}" is not supported. ssh2 requires PEM format keys (RSA, EC, or PKCS8).`,
    };
  }

  // Key exists but conversion returned null for unknown reason
  return {
    key: null,
    format: format,
    error: `Failed to process SSH key in ${format} format`,
  };
}

const servers: Record<string, ServerConfig> = {
  linode: {
    id: "linode",
    name: "Linode Server",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    user: process.env.LINODE_SSH_USER || "root",
    keyPath: DEFAULT_SSH_KEY_PATH,
  },
  home: {
    id: "home",
    name: "Home Server",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
    keyPath: DEFAULT_SSH_KEY_PATH,
  },
};

const TERMINAL_PORT = parseInt(process.env.TERMINAL_PORT || "3001");
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.SESSION_SECRET || "homelab-secret-key-change-in-production"
);

async function verifyToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.purpose !== "terminal") {
      console.warn("Token rejected: purpose is not 'terminal'");
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Token verification failed:", err);
    return false;
  }
}

class TerminalServer {
  private wss: WebSocketServer;
  private server: ReturnType<typeof createServer>;

  constructor() {
    this.server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Terminal WebSocket Server");
    });

    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();
  }

  private async setupWebSocket() {
    this.wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
      const url = parse(req.url || "", true);
      const serverId = url.query.server as string;
      const token = url.query.token as string;

      if (!token) {
        ws.send(JSON.stringify({ type: "error", message: "Authentication required" }));
        ws.close();
        return;
      }

      const isValid = await verifyToken(token);
      if (!isValid) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid or expired token" }));
        ws.close();
        return;
      }

      if (!serverId || !servers[serverId]) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid server ID" }));
        ws.close();
        return;
      }

      const serverConfig = servers[serverId];
      this.handleSSHConnection(ws, serverConfig);
    });
  }

  private handleSSHConnection(ws: WebSocket, serverConfig: ServerConfig) {
    const conn = new Client();
    let stream: ClientChannel | null = null;

    const keyResult = getSSHPrivateKey();
    const privateKey = keyResult.key;
    
    if (!privateKey) {
      const errorMessage = keyResult.error || "SSH key not configured. Please add SSH_PRIVATE_KEY secret.";
      console.error(`[SSH] SSH connection failed: ${errorMessage}`);
      ws.send(JSON.stringify({ 
        type: "error", 
        message: errorMessage
      }));
      ws.close();
      return;
    }

    conn.on("ready", () => {
      ws.send(JSON.stringify({ 
        type: "connected", 
        host: `${serverConfig.user}@${serverConfig.host}` 
      }));

      conn.shell({ term: "xterm-256color" }, (err, shellStream) => {
        if (err) {
          ws.send(JSON.stringify({ type: "error", message: err.message }));
          ws.close();
          return;
        }

        stream = shellStream;

        stream.on("data", (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "data", data: data.toString("utf-8") }));
          }
        });

        stream.stderr.on("data", (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "data", data: data.toString("utf-8") }));
          }
        });

        stream.on("close", () => {
          ws.send(JSON.stringify({ type: "closed" }));
          ws.close();
        });
      });
    });

    conn.on("error", (err) => {
      ws.send(JSON.stringify({ type: "error", message: err.message }));
      ws.close();
    });

    conn.on("close", () => {
      ws.send(JSON.stringify({ type: "closed" }));
      ws.close();
    });

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "input" && stream) {
          stream.write(message.data);
        } else if (message.type === "resize" && stream) {
          stream.setWindow(message.rows, message.cols, 0, 0);
        }
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    });

    ws.on("close", () => {
      if (stream) {
        stream.end();
      }
      conn.end();
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      if (stream) {
        stream.end();
      }
      conn.end();
    });

    try {
      conn.connect({
        host: serverConfig.host,
        port: 22,
        username: serverConfig.user,
        privateKey: privateKey,
        readyTimeout: 30000,
      });
    } catch (err: any) {
      ws.send(JSON.stringify({ type: "error", message: err.message }));
      ws.close();
    }
  }

  start() {
    this.server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`Port ${TERMINAL_PORT} is already in use. Terminal server will not start.`);
        console.warn("Another instance may be running. Set TERMINAL_PORT to use a different port.");
      } else {
        console.error("Terminal server error:", err);
      }
    });
    
    this.server.listen(TERMINAL_PORT, "0.0.0.0", () => {
      console.log(`Terminal WebSocket server running on port ${TERMINAL_PORT}`);
    });
  }

  stop() {
    this.wss.close();
    this.server.close();
  }
}

const terminalServer = new TerminalServer();
terminalServer.start();

process.on("SIGTERM", () => {
  terminalServer.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  terminalServer.stop();
  process.exit(0);
});
