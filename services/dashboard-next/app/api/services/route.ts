import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import {
  getAllManagedServicesStatus,
  startManagedService,
  stopManagedService,
  MANAGED_SERVICES,
  type ManagedServiceId,
} from "@/lib/vm-manager";

type ServiceAction = "start" | "stop";

interface ServiceControlRequest {
  serviceId: ManagedServiceId;
  action: ServiceAction;
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
    const result = await getAllManagedServicesStatus();

    return NextResponse.json({
      success: result.success,
      services: result.services,
    });
  } catch (error: any) {
    console.error("Services status error:", error);
    return NextResponse.json(
      { error: "Failed to get services status", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: ServiceControlRequest = await request.json();
    const { serviceId, action } = body;

    if (!serviceId || typeof serviceId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid serviceId" },
        { status: 400 }
      );
    }

    if (!isValidServiceId(serviceId)) {
      const validIds = Object.keys(MANAGED_SERVICES).join(", ");
      return NextResponse.json(
        { error: `Invalid serviceId. Must be one of: ${validIds}` },
        { status: 400 }
      );
    }

    if (!action || !["start", "stop"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be: start or stop" },
        { status: 400 }
      );
    }

    let result;
    if (action === "start") {
      result = await startManagedService(serviceId);
    } else {
      result = await stopManagedService(serviceId);
    }

    if (!result.success) {
      return NextResponse.json(
        { error: `Failed to ${action} service`, details: result.error },
        { status: 500 }
      );
    }

    const serviceName = MANAGED_SERVICES[serviceId].name;
    return NextResponse.json({
      success: true,
      message: `Service ${serviceName} ${action} command executed`,
      serviceId,
      action,
    });
  } catch (error: any) {
    console.error("Service control error:", error);
    return NextResponse.json(
      { error: "Failed to control service", details: error.message },
      { status: 500 }
    );
  }
}
