import { NextResponse } from "next/server";
import { Client } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { getServerById, getDefaultSshKeyPath } from "@/lib/server-config-store";

export const dynamic = "force-dynamic";

interface SecurityNotification {
  id: string;
  type: "otp" | "reset" | "security";
  recipient: string;
  subject: string;
  code?: string;
  revokeUrl?: string;
  timestamp: string;
  read: boolean;
}

function parseAutheliaNotification(content: string): SecurityNotification | null {
  if (!content.trim()) return null;

  const lines = content.split("\n");
  let date = "";
  let recipient = "";
  let subject = "";
  let code = "";
  let revokeUrl = "";

  for (const line of lines) {
    if (line.startsWith("Date:")) {
      date = line.replace("Date:", "").trim();
    } else if (line.startsWith("Recipient:")) {
      const match = line.match(/\{([^}]+)\s+([^}]+)\}/);
      if (match) {
        recipient = match[2];
      }
    } else if (line.startsWith("Subject:")) {
      subject = line.replace("Subject:", "").trim();
    } else if (line.match(/^[A-Z0-9]{8}$/)) {
      code = line.trim();
    } else if (line.includes("/revoke/one-time-code")) {
      const urlMatch = line.match(/(https:\/\/[^\s]+)/);
      if (urlMatch) {
        revokeUrl = urlMatch[1];
      }
    }
  }

  if (!date && !subject) return null;

  return {
    id: `authelia-${Date.now()}`,
    type: code ? "otp" : subject.toLowerCase().includes("password") ? "reset" : "security",
    recipient,
    subject,
    code,
    revokeUrl,
    timestamp: date || new Date().toISOString(),
    read: false,
  };
}

async function fetchAutheliaNotifications(
  host: string,
  user: string,
  keyPath: string
): Promise<SecurityNotification[]> {
  return new Promise((resolve) => {
    if (!existsSync(keyPath)) {
      console.error("SSH key not found at", keyPath);
      resolve([]);
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve([]);
    }, 10000);

    conn.on("ready", () => {
      const command = `
        NOTIFICATION_FILE="/opt/homelab/HomeLabHub/deploy/local/data/authelia/notification.txt"
        if [ -f "$NOTIFICATION_FILE" ]; then
          cat "$NOTIFICATION_FILE"
        else
          echo ""
        fi
      `;

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve([]);
          return;
        }

        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", () => {
          clearTimeout(timeout);
          conn.end();

          const notification = parseAutheliaNotification(output);
          if (notification) {
            resolve([notification]);
          } else {
            resolve([]);
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      console.error("SSH connection error:", err.message);
      resolve([]);
    });

    try {
      conn.connect({
        host,
        port: 22,
        username: user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 10000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      console.error("SSH connect error:", err.message);
      resolve([]);
    }
  });
}

export async function GET() {
  try {
    const homeServer = await getServerById("home");
    
    if (!homeServer) {
      return NextResponse.json({ notifications: [], error: "Home server not configured" });
    }

    const keyPath = homeServer.keyPath || getDefaultSshKeyPath();
    const notifications = await fetchAutheliaNotifications(
      homeServer.host,
      homeServer.user,
      keyPath
    );

    return NextResponse.json({
      notifications,
      server: homeServer.name,
      lastChecked: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Failed to fetch Authelia notifications:", error);
    return NextResponse.json(
      { notifications: [], error: error.message },
      { status: 500 }
    );
  }
}
