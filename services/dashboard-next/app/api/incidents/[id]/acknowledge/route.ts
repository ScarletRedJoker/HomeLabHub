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

  if (incident.status !== "open") {
    return NextResponse.json(
      { error: "Incident is not in open status" },
      { status: 400 }
    );
  }

  const updated = updateIncident(id, {
    status: "acknowledged",
    acknowledgedBy: user.username || "unknown",
    acknowledgedAt: new Date(),
  });

  return NextResponse.json({ incident: updated });
}
