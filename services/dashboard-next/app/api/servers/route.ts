import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFileSync, existsSync } from "fs";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface ServerConfig {
  id: string;
  name: string;
  description: string;
  host: string;
  user: string;
  keyPath?: string;
}

const servers: ServerConfig[] = [
  {
    id: "linode",
    name: "Linode Server",
    description: "Public services - Discord Bot, Stream Bot",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    user: process.env.LINODE_SSH_USER || "root",
    keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
  },
  {
    id: "home",
    name: "Home Server", 
    description: "Private services - Plex, Home Assistant",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
    keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
  },
];

async function getServerMetrics(server: ServerConfig): Promise<any> {
  return new Promise((resolve) => {
    const keyPath = server.keyPath || "/root/.ssh/id_rsa";
    
    if (!existsSync(keyPath)) {
      resolve({
        id: server.id,
        name: server.name,
        description: server.description,
        status: "error",
        error: "SSH key not found",
        metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
      });
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({
        id: server.id,
        name: server.name,
        description: server.description,
        status: "offline",
        error: "Connection timeout",
        metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
      });
    }, 10000);

    conn.on("ready", () => {
      const commands = `
        echo "CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1 || echo 0)"
        echo "MEM:$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')"
        echo "DISK:$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')"
        echo "UPTIME:$(uptime -p | sed 's/up //')"
        echo "OS:$(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
        echo "LOAD:$(cat /proc/loadavg | awk '{print $1}')"
      `;

      conn.exec(commands, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({
            id: server.id,
            name: server.name,
            description: server.description,
            status: "error",
            error: err.message,
            metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
          });
          return;
        }

        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", () => {
          clearTimeout(timeout);
          conn.end();

          const lines = output.trim().split("\n");
          const metrics: any = {};
          
          for (const line of lines) {
            const [key, value] = line.split(":");
            if (key && value) {
              metrics[key.trim()] = value.trim();
            }
          }

          resolve({
            id: server.id,
            name: server.name,
            description: server.description,
            ip: server.host,
            status: "online",
            os: metrics.OS || "Ubuntu",
            uptime: metrics.UPTIME || "Unknown",
            metrics: {
              cpu: parseInt(metrics.CPU) || 0,
              memory: parseInt(metrics.MEM) || 0,
              disk: parseInt(metrics.DISK) || 0,
              load: parseFloat(metrics.LOAD) || 0,
            },
          });
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        id: server.id,
        name: server.name,
        description: server.description,
        status: "offline",
        error: err.message,
        metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
      });
    });

    try {
      conn.connect({
        host: server.host,
        port: 22,
        username: server.user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 10000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({
        id: server.id,
        name: server.name,
        description: server.description,
        status: "error",
        error: err.message,
        metrics: { cpu: 0, memory: 0, disk: 0, network: "N/A" },
      });
    }
  });
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverId = request.nextUrl.searchParams.get("id");

  try {
    if (serverId) {
      const server = servers.find((s) => s.id === serverId);
      if (!server) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }
      const metrics = await getServerMetrics(server);
      return NextResponse.json(metrics);
    }

    const results = await Promise.all(servers.map(getServerMetrics));
    return NextResponse.json({ servers: results });
  } catch (error: any) {
    console.error("Server metrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch server metrics", details: error.message },
      { status: 500 }
    );
  }
}
