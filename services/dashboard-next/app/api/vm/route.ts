import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { userService } from "@/lib/services/user-service";
import {
  listVMs,
  startVM,
  stopVM,
  restartVM,
  forceStopVM,
  type VMInfo,
} from "@/lib/vm-manager";

type VMAction = "start" | "stop" | "restart" | "force-stop";

interface VMControlRequest {
  vmName?: string;
  vmId?: string;
  action: VMAction;
}

async function checkAdminAuth(): Promise<{ authorized: boolean; isAdmin: boolean }> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return { authorized: false, isAdmin: false };
  
  const sessionData = await verifySession(session.value);
  if (!sessionData) return { authorized: false, isAdmin: false };
  
  if (sessionData.userId) {
    const user = await userService.getUserById(sessionData.userId);
    if (!user || !user.isActive) return { authorized: false, isAdmin: false };
    return { authorized: true, isAdmin: user.role === "admin" };
  }
  
  const user = await userService.getUserByUsername(sessionData.username);
  if (!user || !user.isActive) {
    if (sessionData.username === process.env.ADMIN_USERNAME) {
      return { authorized: true, isAdmin: true };
    }
    return { authorized: false, isAdmin: false };
  }
  
  return { authorized: true, isAdmin: user.role === "admin" };
}

export async function GET(request: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const result = await listVMs();

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to list VMs", details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      vms: result.vms || [],
    });
  } catch (error: any) {
    console.error("VM list error:", error);
    return NextResponse.json(
      { error: "Failed to list VMs", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body: VMControlRequest = await request.json();
    const { vmName, vmId, action } = body;

    const identifier = vmName || vmId;
    if (!identifier || typeof identifier !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid vmName/vmId" },
        { status: 400 }
      );
    }

    if (!action || !["start", "stop", "restart", "force-stop"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be: start, stop, restart, or force-stop" },
        { status: 400 }
      );
    }

    let result;
    switch (action) {
      case "start":
        result = await startVM(identifier);
        break;
      case "stop":
        result = await stopVM(identifier);
        break;
      case "restart":
        result = await restartVM(identifier);
        break;
      case "force-stop":
        result = await forceStopVM(identifier);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: `Failed to ${action} VM`, details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `VM ${identifier} ${action} command executed`,
      output: result.output,
    });
  } catch (error: any) {
    console.error("VM control error:", error);
    return NextResponse.json(
      { error: "Failed to control VM", details: error.message },
      { status: 500 }
    );
  }
}
