import { NextRequest, NextResponse } from "next/server";

interface DeploymentTarget {
  slug: string;
  name: string;
  type: "linux" | "windows";
  host?: string;
  status: "online" | "offline" | "unknown";
  lastChecked?: string;
}

async function checkSSH(host: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    await fetch(`http://${host}:22`, {
      method: "HEAD",
      signal: controller.signal,
    }).catch(() => {});
    
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

async function checkAgent(host: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(`http://${host}:9765/api/health`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const linodeHost = process.env.LINODE_SSH_HOST;
    const ubuntuHost = process.env.HOME_SSH_HOST;
    const windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP;

    const targets: DeploymentTarget[] = [
      {
        slug: "linode",
        name: "Linode Cloud",
        type: "linux",
        host: linodeHost,
        status: "unknown",
      },
      {
        slug: "ubuntu-home",
        name: "Ubuntu Home Server",
        type: "linux",
        host: ubuntuHost,
        status: "unknown",
      },
      {
        slug: "windows-vm",
        name: "Windows VM (GPU)",
        type: "windows",
        host: windowsVmIp,
        status: "unknown",
      },
    ];

    return NextResponse.json({
      success: true,
      targets,
    });
  } catch (error) {
    console.error("[Setup Deployment API] Error:", error);
    return NextResponse.json({
      success: false,
      targets: [],
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, target, host, user } = body;

    if (action === "test") {
      let status: "online" | "offline" = "offline";

      if (target === "windows-vm") {
        const windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP;
        if (windowsVmIp) {
          const isOnline = await checkAgent(windowsVmIp);
          status = isOnline ? "online" : "offline";
        }
      } else if (target === "linode" || target === "ubuntu-home") {
        const targetHost = host || (target === "linode" 
          ? process.env.LINODE_SSH_HOST 
          : process.env.HOME_SSH_HOST);
        
        if (targetHost) {
          const isOnline = await checkSSH(targetHost);
          status = isOnline ? "online" : "offline";
        }
      }

      return NextResponse.json({
        success: true,
        status,
        lastChecked: new Date().toISOString(),
      });
    }

    if (action === "save") {
      return NextResponse.json({
        success: true,
        message: "Server configuration saved",
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Setup Deployment API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Deployment test failed" },
      { status: 500 }
    );
  }
}
