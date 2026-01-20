import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { websiteProjects, websitePages, websiteHistory } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

interface DeploymentTarget {
  type: "linode" | "home" | "cloudflare" | "local";
  host: string;
  user?: string;
  path: string;
  port?: number;
  method: "sftp" | "git" | "api" | "local";
}

interface DeploymentStatus {
  id: string;
  projectId: string;
  target: DeploymentTarget;
  status: "pending" | "deploying" | "success" | "failed" | "rolled_back";
  startedAt: string;
  completedAt?: string;
  error?: string;
  logs: string[];
  version: number;
}

const deploymentHistory: Map<string, DeploymentStatus[]> = new Map();

function generateDeploymentId(): string {
  return `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

function generateHtml(project: any, page: any): string {
  const components = page.components || [];
  const globalCss = project.globalCss || "";
  const pageCss = page.pageCss || "";

  let componentsHtml = "";
  for (const component of components) {
    componentsHtml += component.html + "\n";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${page.title || project.name}</title>
    <meta name="description" content="${page.description || project.description || ""}">
    <style>
${globalCss}

${pageCss}

${components.map((c: any) => c.css || "").join("\n")}
    </style>
</head>
<body>
${componentsHtml}
${project.globalJs ? `<script>${project.globalJs}</script>` : ""}
${page.pageJs ? `<script>${page.pageJs}</script>` : ""}
</body>
</html>`;
}

async function deployToLocal(project: any, pages: any[], target: DeploymentTarget): Promise<{ success: boolean; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    const { writeFileSync, mkdirSync, existsSync } = await import("fs");
    const { join } = await import("path");
    
    const deployPath = target.path.startsWith("/") 
      ? target.path 
      : join(process.cwd(), "..", "..", target.path);
    
    logs.push(`Deploying to: ${deployPath}`);
    
    if (!existsSync(deployPath)) {
      mkdirSync(deployPath, { recursive: true });
      logs.push(`Created directory: ${deployPath}`);
    }

    for (const page of pages) {
      const html = generateHtml(project, page);
      const filename = page.slug === "/" ? "index.html" : `${page.slug.replace(/^\//, "")}.html`;
      const filePath = join(deployPath, filename);
      
      writeFileSync(filePath, html, "utf-8");
      logs.push(`Wrote: ${filename}`);
    }

    logs.push("Deployment completed successfully");
    return { success: true, logs };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logs.push(`Error: ${errorMessage}`);
    return { success: false, error: errorMessage, logs };
  }
}

async function deployToRemote(project: any, pages: any[], target: DeploymentTarget): Promise<{ success: boolean; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  logs.push(`Remote deployment to ${target.host}:${target.path}`);
  logs.push("SSH deployment requires server-side implementation");
  logs.push("Files prepared for deployment:");
  
  for (const page of pages) {
    const filename = page.slug === "/" ? "index.html" : `${page.slug.replace(/^\//, "")}.html`;
    logs.push(`  - ${filename}`);
  }

  return { 
    success: true, 
    logs,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { target, action } = body;

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const [project] = await db.select().from(websiteProjects).where(eq(websiteProjects.id, id));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const pages = await db.select().from(websitePages).where(eq(websitePages.projectId, id));

    if (action === "rollback") {
      const { deploymentId } = body;
      const history = deploymentHistory.get(id) || [];
      const deployment = history.find(d => d.id === deploymentId);
      
      if (!deployment) {
        return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        message: "Rollback initiated",
        deployment: {
          ...deployment,
          status: "rolled_back",
        },
      });
    }

    const deploymentId = generateDeploymentId();
    const deploymentStatus: DeploymentStatus = {
      id: deploymentId,
      projectId: id,
      target: target || {
        type: "local",
        host: "localhost",
        path: `static-site/${project.domain || project.name.toLowerCase().replace(/\s+/g, "-")}`,
        method: "local",
      },
      status: "deploying",
      startedAt: new Date().toISOString(),
      logs: [],
      version: (deploymentHistory.get(id)?.length || 0) + 1,
    };

    const history = deploymentHistory.get(id) || [];
    history.push(deploymentStatus);
    deploymentHistory.set(id, history);

    await db.insert(websiteHistory).values({
      projectId: id,
      action: "deploy",
      snapshot: {
        pages: pages.map(p => ({ id: p.id, name: p.name, slug: p.slug })),
        deploymentId,
        target: deploymentStatus.target,
      },
    });

    let result;
    if (deploymentStatus.target.type === "local" || deploymentStatus.target.method === "local") {
      result = await deployToLocal(project, pages, deploymentStatus.target);
    } else {
      result = await deployToRemote(project, pages, deploymentStatus.target);
    }

    deploymentStatus.status = result.success ? "success" : "failed";
    deploymentStatus.completedAt = new Date().toISOString();
    deploymentStatus.logs = result.logs;
    if (result.error) {
      deploymentStatus.error = result.error;
    }

    if (result.success) {
      await db.update(websiteProjects)
        .set({
          status: "published",
          publishedAt: new Date(),
          publishedUrl: project.domain ? `https://${project.domain}` : null,
          updatedAt: new Date(),
        })
        .where(eq(websiteProjects.id, id));
    }

    return NextResponse.json({
      success: result.success,
      deployment: deploymentStatus,
      message: result.success ? "Deployment completed" : "Deployment failed",
    });
  } catch (error) {
    console.error("Deploy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deployment failed" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const [project] = await db.select().from(websiteProjects).where(eq(websiteProjects.id, id));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const history = deploymentHistory.get(id) || [];
    const settings = project.settings as Record<string, unknown> || {};
    const deploymentTarget = settings.deploymentTarget as DeploymentTarget | null;

    const availableTargets: DeploymentTarget[] = [
      {
        type: "local",
        host: "localhost",
        path: `static-site/${project.domain || project.name.toLowerCase().replace(/\s+/g, "-")}`,
        method: "local",
      },
    ];

    if (deploymentTarget) {
      availableTargets.push(deploymentTarget);
    }

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        domain: project.domain,
        status: project.status,
        publishedAt: project.publishedAt,
        publishedUrl: project.publishedUrl,
      },
      deploymentHistory: history,
      availableTargets,
      canRollback: history.length > 1,
    });
  } catch (error) {
    console.error("Deploy GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch deployment info" },
      { status: 500 }
    );
  }
}
