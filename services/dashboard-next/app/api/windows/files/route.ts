import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { userService } from "@/lib/services/user-service";

const WINDOWS_VM_IP = process.env.WINDOWS_VM_IP || "100.118.44.102";
const NEBULA_AGENT_PORT = process.env.NEBULA_AGENT_PORT || "3847";
const WINDOWS_USER = process.env.WINDOWS_VM_SSH_USER || process.env.WINDOWS_USER || "Evin";

const ALLOWED_BASE_PATHS = [
  `C:\\Users\\${WINDOWS_USER}`,
  `C:\\Users\\${WINDOWS_USER}\\Documents`,
  `C:\\Users\\${WINDOWS_USER}\\Downloads`,
  `C:\\Users\\${WINDOWS_USER}\\Desktop`,
  `C:\\Users\\${WINDOWS_USER}\\Pictures`,
  `C:\\Users\\${WINDOWS_USER}\\Videos`,
  `C:\\Users\\${WINDOWS_USER}\\Music`,
  `D:\\Projects`,
  `D:\\Data`,
];

async function checkAdminAuth(): Promise<{ authorized: boolean; isAdmin: boolean }> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return { authorized: false, isAdmin: false };
  
  const sessionData = await verifySession(session.value);
  if (!sessionData) return { authorized: false, isAdmin: false };
  
  if (sessionData.userId) {
    const user = await userService.getUserById(sessionData.userId);
    if (!user || !user.isActive) return { authorized: false, isAdmin: false };
    return { authorized: true, isAdmin: user.role === "admin" };
  }
  
  const user = await userService.getUserByUsername(sessionData.username);
  if (!user || !user.isActive) {
    if (sessionData.username === process.env.ADMIN_USERNAME) {
      return { authorized: true, isAdmin: true };
    }
    return { authorized: false, isAdmin: false };
  }
  
  return { authorized: true, isAdmin: user.role === "admin" };
}

function isPathAllowed(path: string): boolean {
  const normalizedPath = path.replace(/\//g, "\\").toLowerCase();
  
  const dangerousPaths = [
    "c:\\windows",
    "c:\\program files",
    "c:\\program files (x86)",
    "c:\\programdata",
    "c:\\$recycle.bin",
    "c:\\system volume information",
  ];
  
  for (const dangerous of dangerousPaths) {
    if (normalizedPath.startsWith(dangerous)) {
      return false;
    }
  }
  
  for (const allowedBase of ALLOWED_BASE_PATHS) {
    if (normalizedPath.startsWith(allowedBase.toLowerCase())) {
      return true;
    }
  }
  
  if (normalizedPath.startsWith(`c:\\users\\${WINDOWS_USER.toLowerCase()}`)) {
    return true;
  }
  
  return false;
}

async function executeNebulaAgent(command: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`http://${WINDOWS_VM_IP}:${NEBULA_AGENT_PORT}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, shell: "powershell" }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, output: "", error: `Agent returned ${response.status}` };
    }

    const data = await response.json();
    return {
      success: data.exitCode === 0,
      output: data.stdout || "",
      error: data.stderr || undefined,
    };
  } catch (error: any) {
    return { success: false, output: "", error: error.message };
  }
}

async function executeSSH(command: string): Promise<{ success: boolean; output: string; error?: string }> {
  const { spawn } = require("child_process");

  return new Promise((resolve) => {
    const sshArgs = [
      "-o", "ConnectTimeout=10",
      "-o", "StrictHostKeyChecking=no",
      "-o", "BatchMode=yes",
      `${WINDOWS_USER}@${WINDOWS_VM_IP}`,
      command
    ];

    const proc = spawn("ssh", sshArgs, {
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (error: Error) => {
      resolve({ success: false, output: "", error: error.message });
    });

    proc.on("close", (code: number | null) => {
      if (code === 0) {
        resolve({ success: true, output: stdout, error: stderr || undefined });
      } else {
        resolve({ success: false, output: stdout, error: stderr || `Process exited with code ${code}` });
      }
    });

    setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({ success: false, output: "", error: "Command timed out" });
    }, 30000);
  });
}

async function executePowerShell(script: string): Promise<{ success: boolean; output: string; error?: string }> {
  const escapedScript = script.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  const command = `powershell -NoProfile -NonInteractive -Command "${escapedScript}"`;
  
  const nebulaResult = await executeNebulaAgent(script);
  if (nebulaResult.success || nebulaResult.output) {
    return nebulaResult;
  }
  
  return executeSSH(command);
}

function normalizeWindowsPath(path: string): string {
  let normalized = path.replace(/\//g, "\\");
  if (!normalized.match(/^[A-Za-z]:\\/)) {
    normalized = `C:\\Users\\${WINDOWS_USER}\\${normalized.replace(/^\\+/, "")}`;
  }
  return normalized;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export async function GET(request: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const path = request.nextUrl.searchParams.get("path") || `C:\\Users\\${WINDOWS_USER}`;
  const action = request.nextUrl.searchParams.get("action") || "list";

  const normalizedPath = normalizeWindowsPath(path);

  if (!isPathAllowed(normalizedPath)) {
    return NextResponse.json({ 
      error: "Access denied", 
      details: "Path is outside allowed directories. Access is restricted to user directories only." 
    }, { status: 403 });
  }

  try {
    if (action === "list") {
      const script = `
        $items = Get-ChildItem -Path '${normalizedPath}' -Force -ErrorAction Stop | Select-Object Name, FullName, @{N='Type';E={if($_.PSIsContainer){'directory'}else{'file'}}}, Length, LastWriteTime, Mode
        $result = @()
        foreach ($item in $items) {
          $result += @{
            name = $item.Name
            path = $item.FullName
            type = $item.Type
            size = if($item.Length) { $item.Length } else { 0 }
            modifyTime = $item.LastWriteTime.ToString('o')
            mode = $item.Mode
          }
        }
        $result | ConvertTo-Json -Compress
      `.trim();

      const result = await executePowerShell(script);
      
      if (!result.success && result.error) {
        return NextResponse.json({ error: "Failed to list directory", details: result.error }, { status: 500 });
      }

      let files = [];
      try {
        const output = result.output.trim();
        if (output) {
          const parsed = JSON.parse(output);
          files = Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch (e) {
        files = [];
      }

      files.sort((a: any, b: any) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return NextResponse.json({
        path: normalizedPath,
        basePath: `C:\\Users\\${WINDOWS_USER}`,
        files: files.map((f: any) => ({
          ...f,
          path: f.path.replace(/\\/g, "/"),
        })),
      });
    }

    if (action === "preview") {
      const script = `
        $file = Get-Item -Path '${normalizedPath}' -Force -ErrorAction Stop
        if ($file.PSIsContainer) {
          throw "Cannot preview directories"
        }
        if ($file.Length -gt 1048576) {
          throw "File too large for preview (max 1MB)"
        }
        Get-Content -Path '${normalizedPath}' -Raw -ErrorAction Stop
      `.trim();

      const result = await executePowerShell(script);
      
      if (!result.success) {
        return NextResponse.json({ error: "Failed to preview file", details: result.error }, { status: 500 });
      }

      const extension = normalizedPath.split(".").pop()?.toLowerCase() || "txt";
      
      return NextResponse.json({
        path: normalizedPath,
        content: result.output,
        extension,
      });
    }

    if (action === "download") {
      const script = `
        $file = Get-Item -Path '${normalizedPath}' -Force -ErrorAction Stop
        if ($file.PSIsContainer) {
          throw "Cannot download directories"
        }
        if ($file.Length -gt 10485760) {
          throw "File too large (max 10MB)"
        }
        [Convert]::ToBase64String([IO.File]::ReadAllBytes('${normalizedPath}'))
      `.trim();

      const result = await executePowerShell(script);
      
      if (!result.success) {
        return NextResponse.json({ error: "Failed to download file", details: result.error }, { status: 500 });
      }

      const buffer = Buffer.from(result.output.trim(), "base64");
      const fileName = normalizedPath.split("\\").pop() || "download";

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Windows files error:", error);
    return NextResponse.json(
      { error: "Windows file operation failed", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const action = formData.get("action") as string;
    const path = formData.get("path") as string;

    if (!path) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    const normalizedPath = normalizeWindowsPath(path);

    if (!isPathAllowed(normalizedPath)) {
      return NextResponse.json({ 
        error: "Access denied", 
        details: "Path is outside allowed directories. Access is restricted to user directories only." 
      }, { status: 403 });
    }

    if (action === "mkdir") {
      const name = formData.get("name") as string;
      if (!name) {
        return NextResponse.json({ error: "Directory name required" }, { status: 400 });
      }
      
      const newPath = `${normalizedPath}\\${name}`;
      const script = `New-Item -Path '${newPath}' -ItemType Directory -Force -ErrorAction Stop | Out-Null; Write-Output 'success'`;
      
      const result = await executePowerShell(script);
      if (!result.success) {
        return NextResponse.json({ error: "Failed to create directory", details: result.error }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, path: newPath });
    }

    if (action === "delete") {
      const script = `Remove-Item -Path '${normalizedPath}' -Recurse -Force -ErrorAction Stop; Write-Output 'success'`;
      
      const result = await executePowerShell(script);
      if (!result.success) {
        return NextResponse.json({ error: "Failed to delete", details: result.error }, { status: 500 });
      }
      
      return NextResponse.json({ success: true });
    }

    if (action === "rename") {
      const newName = formData.get("newName") as string;
      if (!newName) {
        return NextResponse.json({ error: "New name required" }, { status: 400 });
      }
      
      const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf("\\"));
      const newPath = `${parentPath}\\${newName}`;
      const script = `Rename-Item -Path '${normalizedPath}' -NewName '${newName}' -Force -ErrorAction Stop; Write-Output 'success'`;
      
      const result = await executePowerShell(script);
      if (!result.success) {
        return NextResponse.json({ error: "Failed to rename", details: result.error }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, path: newPath });
    }

    if (action === "upload") {
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ error: "File required" }, { status: 400 });
      }
      
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64Content = buffer.toString("base64");
      const uploadPath = `${normalizedPath}\\${file.name}`;
      
      const script = `
        $bytes = [Convert]::FromBase64String('${base64Content}')
        [IO.File]::WriteAllBytes('${uploadPath}', $bytes)
        Write-Output 'success'
      `.trim();
      
      const result = await executePowerShell(script);
      if (!result.success) {
        return NextResponse.json({ error: "Failed to upload file", details: result.error }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, path: uploadPath });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Windows files POST error:", error);
    return NextResponse.json(
      { error: "Windows file operation failed", details: error.message },
      { status: 500 }
    );
  }
}
