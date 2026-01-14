import { NextRequest, NextResponse } from "next/server";
import { getRemoteAccessConfigs } from "@/lib/local-deploy";
import { checkServerOnline } from "@/lib/wol-relay";

export async function GET(request: NextRequest) {
  try {
    const configs = getRemoteAccessConfigs();
    
    const results: Record<string, any> = {};
    
    for (const [node, accessConfigs] of Object.entries(configs)) {
      results[node] = await Promise.all(
        accessConfigs.map(async (config) => {
          const online = await checkServerOnline(config.host, config.port, 3000);
          return {
            ...config,
            status: online ? "available" : "offline",
          };
        })
      );
    }
    
    return NextResponse.json({
      success: true,
      remoteAccess: results,
      instructions: {
        vnc: "Use any VNC client (RealVNC, TigerVNC Viewer, Remmina)",
        rdp: "Use Windows Remote Desktop or Remmina on Linux",
        sunshine: "Install Moonlight client from moonlight-stream.org for best GPU streaming",
        ssh: "Use any SSH client or terminal",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
