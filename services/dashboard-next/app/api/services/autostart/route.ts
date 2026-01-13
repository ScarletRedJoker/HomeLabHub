import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import {
  getWindowsStartupTasks,
  setWindowsStartupTask,
  MANAGED_SERVICES,
  type ManagedServiceId,
} from "@/lib/vm-manager";

interface AutostartRequest {
  serviceId: string;
  enabled: boolean;
}

async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

function isValidServiceId(id: string): id is ManagedServiceId {
  return id in MANAGED_SERVICES;
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await getWindowsStartupTasks();

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to get startup tasks", details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tasks: result.tasks || [],
    });
  } catch (error: any) {
    console.error("Startup tasks error:", error);
    return NextResponse.json(
      { error: "Failed to get startup tasks", details: error.message },
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
    const { serviceId, enabled } = body;

    if (!serviceId || typeof serviceId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid serviceId" },
        { status: 400 }
      );
    }

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid enabled (must be boolean)" },
        { status: 400 }
      );
    }

    let taskName: string;
    let command: string;

    if (isValidServiceId(serviceId)) {
      const service = MANAGED_SERVICES[serviceId];
      taskName = `Autostart_${service.name.replace(/\s+/g, "_")}`;
      command = service.startCommand;
    } else {
      taskName = `Autostart_${serviceId}`;
      command = serviceId;
    }

    const result = await setWindowsStartupTask(taskName, command, enabled);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to configure startup task", details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      serviceId,
      enabled,
      taskName,
      message: `Startup task ${enabled ? "created" : "removed"} for ${serviceId}`,
    });
  } catch (error: any) {
    console.error("Startup task configuration error:", error);
    return NextResponse.json(
      { error: "Failed to configure startup task", details: error.message },
      { status: 500 }
    );
  }
}
