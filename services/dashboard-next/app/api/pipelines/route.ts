import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deployments, projects } from "@/lib/db/platform-schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allDeployments = await db
      .select({
        id: deployments.id,
        projectId: deployments.projectId,
        environment: deployments.environment,
        status: deployments.status,
        version: deployments.version,
        buildLogs: deployments.buildLogs,
        deployedAt: deployments.deployedAt,
        createdAt: deployments.createdAt,
        projectName: projects.name,
        projectType: projects.projectType,
        projectFramework: projects.framework,
      })
      .from(deployments)
      .leftJoin(projects, eq(deployments.projectId, projects.id))
      .orderBy(desc(deployments.createdAt));

    return NextResponse.json({ pipelines: allDeployments });
  } catch (error: any) {
    console.error("Error fetching pipelines:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch pipelines" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, environment, targetServer } = body;

    if (!projectId || !environment) {
      return NextResponse.json(
        { error: "Project ID and environment are required" },
        { status: 400 }
      );
    }

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project.length) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const [newDeployment] = await db
      .insert(deployments)
      .values({
        projectId,
        environment,
        status: "pending",
        version: "1.0.0",
      })
      .returning();

    return NextResponse.json({
      success: true,
      pipeline: newDeployment,
    });
  } catch (error: any) {
    console.error("Error creating pipeline:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create pipeline" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Pipeline ID is required" },
        { status: 400 }
      );
    }

    const [deleted] = await db
      .delete(deployments)
      .where(eq(deployments.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Pipeline not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Pipeline deleted",
    });
  } catch (error: any) {
    console.error("Error deleting pipeline:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete pipeline" },
      { status: 500 }
    );
  }
}
