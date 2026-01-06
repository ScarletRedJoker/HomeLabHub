import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { remediationEngine } from "@/lib/remediation-engine";

interface Incident {
  id: string;
  serviceName: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "acknowledged" | "resolved";
  title: string;
  description?: string;
  runbookId?: string;
  resolution?: string;
  acknowledgedBy?: string;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  runbookExecution?: any;
}

const incidents: Map<string, Incident> = new Map();

async function checkAuth() {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  let filteredIncidents = Array.from(incidents.values());

  if (status) {
    filteredIncidents = filteredIncidents.filter((i) => i.status === status);
  }
  if (severity) {
    filteredIncidents = filteredIncidents.filter((i) => i.severity === severity);
  }

  filteredIncidents.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const total = filteredIncidents.length;
  const paged = filteredIncidents.slice(offset, offset + limit);

  return NextResponse.json({
    incidents: paged,
    total,
    limit,
    offset,
  });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      serviceName,
      severity,
      title,
      description,
      runbookId,
      autoRemediate,
      context,
    } = body;

    if (!serviceName || !severity || !title) {
      return NextResponse.json(
        { error: "Missing required fields: serviceName, severity, title" },
        { status: 400 }
      );
    }

    const incident: Incident = {
      id: `inc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      serviceName,
      severity,
      status: "open",
      title,
      description,
      runbookId,
      createdAt: new Date(),
    };

    incidents.set(incident.id, incident);

    if (autoRemediate && runbookId) {
      try {
        remediationEngine.loadRunbooks();
        const execution = await remediationEngine.executeRunbook(runbookId, {
          incidentId: incident.id,
          serviceName,
          ...context,
        });
        incident.runbookExecution = execution;

        if (execution.status === "completed") {
          incident.status = "resolved";
          incident.resolvedAt = new Date();
          incident.resolution = "Automatically resolved by runbook";
        }
      } catch (runbookError: any) {
        console.error("Runbook execution failed:", runbookError);
        incident.description = `${incident.description || ""}\n\nRunbook Error: ${runbookError.message}`;
      }
    }

    return NextResponse.json({ incident }, { status: 201 });
  } catch (error: any) {
    console.error("Create incident error:", error);
    return NextResponse.json(
      { error: "Failed to create incident", details: error.message },
      { status: 500 }
    );
  }
}

export function getIncidentById(id: string): Incident | undefined {
  return incidents.get(id);
}

export function updateIncident(id: string, updates: Partial<Incident>): Incident | undefined {
  const incident = incidents.get(id);
  if (incident) {
    Object.assign(incident, updates);
    incidents.set(id, incident);
  }
  return incident;
}
