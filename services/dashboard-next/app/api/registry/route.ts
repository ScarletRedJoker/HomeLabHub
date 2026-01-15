import { NextRequest, NextResponse } from "next/server";

const AGENT_TOKEN = process.env.NEBULA_AGENT_TOKEN;

function verifyAgentToken(request: NextRequest): boolean {
  if (!AGENT_TOKEN) return true;
  
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  
  return authHeader.slice(7) === AGENT_TOKEN;
}

export async function POST(request: NextRequest) {
  if (!verifyAgentToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, capabilities, endpoint, metadata, action = "register" } = body;

    if (action === "heartbeat") {
      const { sendHeartbeat } = await import("@/lib/service-registry");
      const success = await sendHeartbeat(name);
      return NextResponse.json({ success });
    }

    if (action === "unregister") {
      const { unregisterServiceByName } = await import("@/lib/service-registry");
      const success = await unregisterServiceByName(name);
      return NextResponse.json({ success });
    }

    if (!name || !capabilities || !endpoint) {
      return NextResponse.json(
        { error: "Missing required fields: name, capabilities, endpoint" },
        { status: 400 }
      );
    }

    const { registerServiceRemote } = await import("@/lib/service-registry");
    const success = await registerServiceRemote(name, capabilities, endpoint, metadata || {});

    return NextResponse.json({
      success,
      message: success ? `Service ${name} registered` : "Registration failed",
    });
  } catch (error: any) {
    console.error("[Registry API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const capability = searchParams.get("capability");
    const name = searchParams.get("name");

    if (name) {
      const { discoverService } = await import("@/lib/service-registry");
      const service = await discoverService(name);
      return NextResponse.json({ success: true, service });
    }

    if (capability) {
      const { discoverByCapability } = await import("@/lib/service-registry");
      const services = await discoverByCapability(capability);
      return NextResponse.json({ success: true, services });
    }

    const { getAllServices } = await import("@/lib/service-registry");
    const services = await getAllServices();
    return NextResponse.json({ success: true, services });
  } catch (error: any) {
    console.error("[Registry API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
