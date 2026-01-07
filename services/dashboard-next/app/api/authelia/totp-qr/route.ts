import { NextResponse } from "next/server";
import { Client } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { getServerById, getDefaultSshKeyPath } from "@/lib/server-config-store";

export const dynamic = "force-dynamic";

async function fetchTotpQr(
  host: string,
  user: string,
  keyPath: string
): Promise<{ base64: string; filename: string } | null> {
  return new Promise((resolve) => {
    if (!existsSync(keyPath)) {
      console.error("SSH key not found at", keyPath);
      resolve(null);
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve(null);
    }, 15000);

    conn.on("ready", () => {
      const command = `
        AUTHELIA_DIR="/opt/homelab/HomeLabHub/deploy/local/services/authelia"
        QR_FILE=$(ls -t "$AUTHELIA_DIR"/*-totp.png 2>/dev/null | head -1)
        if [ -n "$QR_FILE" ] && [ -f "$QR_FILE" ]; then
          echo "FILE:$(basename "$QR_FILE")"
          base64 -w 0 "$QR_FILE"
        else
          echo "NONE"
        fi
      `;

      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve(null);
          return;
        }

        let output = "";
        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.on("close", () => {
          clearTimeout(timeout);
          conn.end();

          if (output.trim() === "NONE" || !output.includes("FILE:")) {
            resolve(null);
            return;
          }

          const lines = output.trim().split("\n");
          const fileMatch = lines[0]?.match(/^FILE:(.+)$/);
          if (fileMatch && lines.length > 1) {
            resolve({
              filename: fileMatch[1],
              base64: lines.slice(1).join(""),
            });
          } else {
            resolve(null);
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      console.error("SSH connection error:", err.message);
      resolve(null);
    });

    try {
      conn.connect({
        host,
        port: 22,
        username: user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 15000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      console.error("SSH connect error:", err.message);
      resolve(null);
    }
  });
}

export async function GET() {
  try {
    const homeServer = await getServerById("home");
    
    if (!homeServer) {
      return NextResponse.json({ qrCode: null, error: "Home server not configured" });
    }

    const keyPath = homeServer.keyPath || getDefaultSshKeyPath();
    const result = await fetchTotpQr(
      homeServer.host,
      homeServer.user,
      keyPath
    );

    if (result) {
      return NextResponse.json({
        qrCode: `data:image/png;base64,${result.base64}`,
        filename: result.filename,
        server: homeServer.name,
      });
    }

    return NextResponse.json({
      qrCode: null,
      message: "No TOTP QR code found",
      server: homeServer.name,
    });
  } catch (error: any) {
    console.error("Failed to fetch TOTP QR:", error);
    return NextResponse.json(
      { qrCode: null, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const homeServer = await getServerById("home");
    
    if (!homeServer) {
      return NextResponse.json({ success: false, error: "Home server not configured" });
    }

    const keyPath = homeServer.keyPath || getDefaultSshKeyPath();
    
    return new Promise((resolve) => {
      if (!existsSync(keyPath)) {
        resolve(NextResponse.json({ success: false, error: "SSH key not found" }));
        return;
      }

      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.end();
        resolve(NextResponse.json({ success: false, error: "Timeout" }));
      }, 10000);

      conn.on("ready", () => {
        const command = `rm -f /opt/homelab/HomeLabHub/deploy/local/services/authelia/*-totp.png`;

        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            resolve(NextResponse.json({ success: false, error: err.message }));
            return;
          }

          stream.on("close", () => {
            clearTimeout(timeout);
            conn.end();
            resolve(NextResponse.json({ success: true }));
          });
        });
      });

      conn.on("error", (err) => {
        clearTimeout(timeout);
        resolve(NextResponse.json({ success: false, error: err.message }));
      });

      conn.connect({
        host: homeServer.host,
        port: 22,
        username: homeServer.user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 10000,
      });
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
