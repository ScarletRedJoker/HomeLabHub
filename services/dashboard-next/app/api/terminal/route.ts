import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

const servers = [
  { 
    id: "linode", 
    name: "Linode Server", 
    description: "root@linode.evindrake.net",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    user: process.env.LINODE_SSH_USER || "root",
  },
  { 
    id: "home", 
    name: "Home Server", 
    description: "evin@host.evindrake.net",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
  },
];

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ 
    servers,
    wsPort: process.env.TERMINAL_PORT || 3001,
    message: "Use WebSocket on the specified port to connect to terminal sessions"
  });
}
