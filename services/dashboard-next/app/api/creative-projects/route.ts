import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { creativeProjects, creativeProjectAssets } from "@/lib/db/platform-schema";
import { eq, desc, and } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = request.nextUrl.searchParams.get("type");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");

    if (!isDbConnected()) {
      return NextResponse.json({ 
        success: true, 
        projects: [],
        source: "demo" 
      });
    }

    const projects = await db.select()
      .from(creativeProjects)
      .where(eq(creativeProjects.userId, user.username))
      .orderBy(desc(creativeProjects.updatedAt))
      .limit(limit);

    let filteredProjects = projects;
    if (type) {
      filteredProjects = filteredProjects.filter(p => p.type === type);
    }

    return NextResponse.json({ success: true, projects: filteredProjects });
  } catch (error: unknown) {
    console.error("Creative Projects GET error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to fetch projects" 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, type = "image", data = {}, thumbnail } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const newProject = await db.insert(creativeProjects)
      .values({
        name,
        type,
        data,
        thumbnail,
        userId: user.username,
      })
      .returning();

    return NextResponse.json({ 
      success: true, 
      project: newProject[0]
    });
  } catch (error: unknown) {
    console.error("Creative Projects POST error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to create project" 
    }, { status: 500 });
  }
}
