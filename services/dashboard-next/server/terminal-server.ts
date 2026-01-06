import { WebSocketServer, WebSocket } from "ws";
import { Client, ClientChannel } from "ssh2";
import { createServer, IncomingMessage } from "http";
import { parse } from "url";
import { readFileSync, existsSync } from "fs";
import { jwtVerify } from "jose";

interface ServerConfig {
  id: string;
  name: string;
  host: string;
  user: string;
  keyPath: string;
}

const servers: Record<string, ServerConfig> = {
  linode: {
    id: "linode",
    name: "Linode Server",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    user: process.env.LINODE_SSH_USER || "root",
    keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
  },
  home: {
    id: "home",
    name: "Home Server",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
    keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
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

    const keyPath = serverConfig.keyPath;
    if (!existsSync(keyPath)) {
      ws.send(JSON.stringify({ 
        type: "error", 
        message: `SSH key not found at ${keyPath}` 
      }));
      ws.close();
      return;
    }

    let privateKey: Buffer;
    try {
      privateKey = readFileSync(keyPath);
    } catch (err: any) {
      ws.send(JSON.stringify({ 
        type: "error", 
        message: `Failed to read SSH key: ${err.message}` 
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
