import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { checkServerOnline } from "@/lib/wol-relay";

const UBUNTU_IP = process.env.UBUNTU_TAILSCALE_IP || "100.66.61.51";
const UBUNTU_USER = process.env.UBUNTU_USER || "nebula";

async function executeSSHCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    
    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        stream.on("close", () => {
          conn.end();
          resolve({ stdout, stderr });
        });
        
        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        
        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });
    
    conn.on("error", reject);
    
    const privateKey = process.env.SSH_PRIVATE_KEY;
    if (!privateKey) {
      return reject(new Error("SSH_PRIVATE_KEY not configured"));
    }
    
    conn.connect({
      host: UBUNTU_IP,
      port: 22,
      username: UBUNTU_USER,
      privateKey,
    });
  });
}

export async function GET(request: NextRequest) {
  try {
    const online = await checkServerOnline(UBUNTU_IP, 22, 5000);
    
    if (!online) {
      return NextResponse.json({
        success: true,
        status: "offline",
        host: UBUNTU_IP,
      });
    }
    
    return NextResponse.json({
      success: true,
      status: "online",
      host: UBUNTU_IP,
      services: {
        libvirtd: "check with SSH",
        plex: "check with SSH",
        transmission: "check with SSH",
        vnc: "check with SSH",
        xrdp: "check with SSH",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, service } = body;
    
    const ALLOWED_ACTIONS = ["start", "stop", "restart", "status", "vm-start", "vm-stop", "vm-status"];
    const ALLOWED_SERVICES = [
      "libvirtd", "plex", "transmission", "vnc", "xrdp", "docker",
      "windows-vm", "all"
    ];
    
    if (!ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action: ${action}` },
        { status: 400 }
      );
    }
    
    if (service && !ALLOWED_SERVICES.includes(service)) {
      return NextResponse.json(
        { success: false, error: `Invalid service: ${service}` },
        { status: 400 }
      );
    }
    
    let command: string;
    
    switch (action) {
      case "vm-start":
        command = "sudo virsh start windows11";
        break;
      case "vm-stop":
        command = "sudo virsh shutdown windows11";
        break;
      case "vm-status":
        command = "sudo virsh domstate windows11";
        break;
      case "start":
      case "stop":
      case "restart":
      case "status":
        if (service === "vnc") {
          if (action === "start") {
            command = "vncserver :1 -geometry 1920x1080 -depth 24";
          } else if (action === "stop") {
            command = "vncserver -kill :1";
          } else if (action === "status") {
            command = "vncserver -list";
          } else {
            command = "vncserver -kill :1 && vncserver :1 -geometry 1920x1080 -depth 24";
          }
        } else if (service === "windows-vm") {
          if (action === "start") {
            command = "sudo virsh start windows11";
          } else if (action === "stop") {
            command = "sudo virsh shutdown windows11";
          } else {
            command = "sudo virsh domstate windows11";
          }
        } else {
          command = `sudo systemctl ${action} ${service}`;
        }
        break;
      default:
        return NextResponse.json(
          { success: false, error: "Unknown action" },
          { status: 400 }
        );
    }
    
    const { stdout, stderr } = await executeSSHCommand(command);
    
    return NextResponse.json({
      success: true,
      action,
      service,
      output: stdout,
      error: stderr || undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
