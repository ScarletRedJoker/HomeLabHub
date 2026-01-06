import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getIncidentById, updateIncident } from "../../route";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const incident = getIncidentById(id);

  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  if (incident.status === "resolved") {
    return NextResponse.json(
      { error: "Incident is already resolved" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const resolution = body.resolution || "Manually resolved";

    const updated = updateIncident(id, {
      status: "resolved",
      resolution,
      resolvedAt: new Date(),
    });

    return NextResponse.json({ incident: updated });
  } catch (error: any) {
    console.error("Resolve incident error:", error);
    return NextResponse.json(
      { error: "Failed to resolve incident", details: error.message },
      { status: 500 }
    );
  }
}
