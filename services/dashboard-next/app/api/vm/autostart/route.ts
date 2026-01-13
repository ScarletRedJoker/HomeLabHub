import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getVMAutostart, setVMAutostart } from "@/lib/vm-manager";

interface AutostartRequest {
  vmName?: string;
  vmId?: string;
  enabled: boolean;
}

async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vmName = request.nextUrl.searchParams.get("vmName");
  const vmId = request.nextUrl.searchParams.get("vmId");

  const identifier = vmName || vmId;
  if (!identifier) {
    return NextResponse.json(
      { error: "Missing vmName or vmId query parameter" },
      { status: 400 }
    );
  }

  try {
    const result = await getVMAutostart(identifier);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to get autostart status", details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      vmName: identifier,
      autostart: result.enabled || false,
    });
  } catch (error: any) {
    console.error("VM autostart status error:", error);
    return NextResponse.json(
      { error: "Failed to get autostart status", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: AutostartRequest = await request.json();
    const { vmName, vmId, enabled } = body;

    const identifier = vmName || vmId;
    if (!identifier || typeof identifier !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid vmName/vmId" },
        { status: 400 }
      );
    }

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid enabled (must be boolean)" },
        { status: 400 }
      );
    }

    const result = await setVMAutostart(identifier, enabled);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to set autostart", details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      vmName: identifier,
      autostart: enabled,
      message: `Autostart ${enabled ? "enabled" : "disabled"} for VM ${identifier}`,
    });
  } catch (error: any) {
    console.error("VM autostart set error:", error);
    return NextResponse.json(
      { error: "Failed to set autostart", details: error.message },
      { status: 500 }
    );
  }
}
