import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "fs";
import { join, dirname, extname } from "path";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

const ALLOWED_BASE_PATHS = [
  process.env.STUDIO_PROJECTS_PATH || "/opt/homelab/studio-projects",
  "/opt/homelab/HomeLabHub",
];

function isPathAllowed(filePath: string): boolean {
  const normalizedPath = join("/", filePath);
  return ALLOWED_BASE_PATHS.some(basePath => 
    normalizedPath.startsWith(basePath) || 
    filePath.startsWith(basePath)
  );
}

function getFileTree(dirPath: string, depth = 0, maxDepth = 3): any[] {
  if (depth > maxDepth || !existsSync(dirPath)) return [];

  try {
    const items = readdirSync(dirPath);
    const result: any[] = [];

    for (const item of items) {
      if (item.startsWith(".") && item !== ".env.example") continue;
      if (["node_modules", "__pycache__", ".git", "dist", "build", ".next"].includes(item)) continue;

      const fullPath = join(dirPath, item);
      try {
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          result.push({
            name: item,
            path: fullPath,
            type: "directory",
            children: depth < maxDepth ? getFileTree(fullPath, depth + 1, maxDepth) : [],
          });
        } else {
          result.push({
            name: item,
            path: fullPath,
            type: "file",
            size: stat.size,
            extension: extname(item).slice(1) || "txt",
          });
        }
      } catch {
        continue;
      }
    }

    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  const action = request.nextUrl.searchParams.get("action") || "read";

  if (!path) {
    const trees = ALLOWED_BASE_PATHS.filter(existsSync).map(basePath => ({
      name: basePath.split("/").pop(),
      path: basePath,
      type: "directory",
      children: getFileTree(basePath),
    }));
    return NextResponse.json({ trees });
  }

  if (!isPathAllowed(path)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    if (action === "tree") {
      const tree = getFileTree(path);
      return NextResponse.json({ tree });
    }

    if (!existsSync(path)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stat = statSync(path);
    if (stat.isDirectory()) {
      const tree = getFileTree(path);
      return NextResponse.json({ tree, isDirectory: true });
    }

    if (stat.size > 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 1MB)" }, { status: 400 });
    }

    const content = readFileSync(path, "utf-8");
    const extension = extname(path).slice(1) || "txt";

    return NextResponse.json({
      path,
      content,
      extension,
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  } catch (error: any) {
    console.error("File read error:", error);
    return NextResponse.json(
      { error: "Failed to read file", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { path, content } = await request.json();

    if (!path || content === undefined) {
      return NextResponse.json({ error: "Missing path or content" }, { status: 400 });
    }

    if (!isPathAllowed(path)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(path, content, "utf-8");

    return NextResponse.json({
      success: true,
      path,
      size: Buffer.byteLength(content, "utf-8"),
    });
  } catch (error: any) {
    console.error("File write error:", error);
    return NextResponse.json(
      { error: "Failed to write file", details: error.message },
      { status: 500 }
    );
  }
}
