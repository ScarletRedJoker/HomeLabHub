import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import SftpClient from "ssh2-sftp-client";
import { readFileSync, existsSync } from "fs";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface ServerConfig {
  id: string;
  name: string;
  host: string;
  user: string;
  keyPath: string;
  basePath: string;
}

const servers: Record<string, ServerConfig> = {
  linode: {
    id: "linode",
    name: "Linode Server",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    user: process.env.LINODE_SSH_USER || "root",
    keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
    basePath: "/opt/homelab",
  },
  home: {
    id: "home",
    name: "Home Server",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
    keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
    basePath: "/opt/homelab",
  },
};

function getServer(serverId: string): ServerConfig | null {
  return servers[serverId] || null;
}

async function getSftpConnection(server: ServerConfig): Promise<SftpClient> {
  const sftp = new SftpClient();
  
  if (!existsSync(server.keyPath)) {
    throw new Error(`SSH key not found at ${server.keyPath}`);
  }

  await sftp.connect({
    host: server.host,
    port: 22,
    username: server.user,
    privateKey: readFileSync(server.keyPath),
    readyTimeout: 10000,
  });

  return sftp;
}

function normalizePath(basePath: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!normalizedPath.startsWith(basePath)) {
    return basePath;
  }
  return normalizedPath;
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverId = request.nextUrl.searchParams.get("server");
  const path = request.nextUrl.searchParams.get("path") || "";
  const action = request.nextUrl.searchParams.get("action") || "list";

  if (!serverId) {
    return NextResponse.json({ servers: Object.values(servers).map(s => ({ id: s.id, name: s.name, basePath: s.basePath })) });
  }

  const server = getServer(serverId);
  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  let sftp: SftpClient | null = null;
  try {
    sftp = await getSftpConnection(server);
    const fullPath = normalizePath(server.basePath, path || server.basePath);

    if (action === "list") {
      const items = await sftp.list(fullPath);
      const files = items.map((item) => ({
        name: item.name,
        path: `${fullPath}/${item.name}`,
        type: item.type === "d" ? "directory" : "file",
        size: item.size,
        modifyTime: item.modifyTime,
        accessTime: item.accessTime,
        rights: item.rights,
        owner: item.owner,
        group: item.group,
      }));

      files.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return NextResponse.json({
        path: fullPath,
        basePath: server.basePath,
        files,
      });
    }

    if (action === "download") {
      const stat = await sftp.stat(fullPath);
      if (stat.isDirectory) {
        return NextResponse.json({ error: "Cannot download directories" }, { status: 400 });
      }
      if (stat.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
      }

      const content = await sftp.get(fullPath);
      const fileName = fullPath.split("/").pop() || "download";

      await sftp.end();
      return new NextResponse(content as Buffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    if (action === "preview") {
      const stat = await sftp.stat(fullPath);
      if (stat.isDirectory) {
        return NextResponse.json({ error: "Cannot preview directories" }, { status: 400 });
      }
      if (stat.size > 1 * 1024 * 1024) {
        return NextResponse.json({ error: "File too large for preview (max 1MB)" }, { status: 400 });
      }

      const content = await sftp.get(fullPath);
      const text = content.toString("utf-8");
      const extension = fullPath.split(".").pop()?.toLowerCase() || "txt";

      return NextResponse.json({
        path: fullPath,
        content: text,
        extension,
        size: stat.size,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("SFTP error:", error);
    return NextResponse.json(
      { error: "SFTP operation failed", details: error.message },
      { status: 500 }
    );
  } finally {
    if (sftp) {
      try {
        await sftp.end();
      } catch {}
    }
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sftp: SftpClient | null = null;
  try {
    const formData = await request.formData();
    const serverId = formData.get("server") as string;
    const action = formData.get("action") as string;
    const path = formData.get("path") as string;

    if (!serverId) {
      return NextResponse.json({ error: "Server ID required" }, { status: 400 });
    }

    const server = getServer(serverId);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    sftp = await getSftpConnection(server);
    const fullPath = normalizePath(server.basePath, path);

    if (action === "mkdir") {
      const name = formData.get("name") as string;
      if (!name) {
        return NextResponse.json({ error: "Directory name required" }, { status: 400 });
      }
      const newPath = `${fullPath}/${name}`;
      await sftp.mkdir(newPath, true);
      return NextResponse.json({ success: true, path: newPath });
    }

    if (action === "delete") {
      const stat = await sftp.stat(fullPath);
      if (stat.isDirectory) {
        await sftp.rmdir(fullPath, true);
      } else {
        await sftp.delete(fullPath);
      }
      return NextResponse.json({ success: true });
    }

    if (action === "rename") {
      const newName = formData.get("newName") as string;
      if (!newName) {
        return NextResponse.json({ error: "New name required" }, { status: 400 });
      }
      const parentPath = fullPath.substring(0, fullPath.lastIndexOf("/"));
      const newPath = `${parentPath}/${newName}`;
      await sftp.rename(fullPath, newPath);
      return NextResponse.json({ success: true, path: newPath });
    }

    if (action === "upload") {
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ error: "File required" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadPath = `${fullPath}/${file.name}`;
      await sftp.put(buffer, uploadPath);
      return NextResponse.json({ success: true, path: uploadPath });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("SFTP POST error:", error);
    return NextResponse.json(
      { error: "SFTP operation failed", details: error.message },
      { status: 500 }
    );
  } finally {
    if (sftp) {
      try {
        await sftp.end();
      } catch {}
    }
  }
}
