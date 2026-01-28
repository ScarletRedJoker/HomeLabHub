import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { userService } from "@/lib/services/user-service";
import https from "https";

interface DomainConfig {
  domain: string;
  service: string;
  backend: string;
}

const CONFIGURED_DOMAINS: DomainConfig[] = [
  { domain: "bot.evindrake.net", service: "Discord Bot", backend: "discord-bot:4000" },
  { domain: "stream.evindrake.net", service: "Stream Bot", backend: "stream-bot:5001" },
  { domain: "discord.evindrake.net", service: "Discord Bot", backend: "discord-bot:4000" },
  { domain: "rig-city.com", service: "Static Site", backend: "rig-city-site:80" },
  { domain: "host.evindrake.net", service: "Dashboard", backend: "dockerhost:5000" },
  { domain: "dashboard.evindrake.net", service: "Dashboard", backend: "dockerhost:5000" },
  { domain: "n8n.evindrake.net", service: "N8N", backend: "n8n:5678" },
  { domain: "code.evindrake.net", service: "Code Server", backend: "code-server-proxy:8080" },
  { domain: "scarletredjoker.com", service: "Static Site", backend: "scarletredjoker-web:80" },
  { domain: "plex.evindrake.net", service: "Plex", backend: "10.200.0.2:32400" },
  { domain: "home.evindrake.net", service: "Home Assistant", backend: "10.200.0.2:8123" },
  { domain: "game.evindrake.net", service: "Game Streaming", backend: "10.200.0.2:47990" },
  { domain: "grafana.evindrake.net", service: "Grafana", backend: "homelab-grafana:3000" },
  { domain: "dns.evindrake.net", service: "DNS Manager", backend: "dns-manager:8001" },
  { domain: "dash.evindrake.net", service: "Dashboard", backend: "dockerhost:5000" },
  { domain: "mail.evindrake.net", service: "Mail", backend: "localhost:8025" },
  { domain: "webmail.evindrake.net", service: "Webmail", backend: "localhost:8025" },
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

async function resolveDNS(hostname: string): Promise<{ resolved: boolean; ip: string | null }> {
  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
      {
        headers: { Accept: "application/dns-json" },
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.Answer && data.Answer.length > 0) {
        return { resolved: true, ip: data.Answer[0].data };
      }
    }
    return { resolved: false, ip: null };
  } catch {
    return { resolved: false, ip: null };
  }
}

async function checkHTTPS(hostname: string): Promise<{ valid: boolean; expiry: string | null }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ valid: false, expiry: null });
    }, 10000);

    try {
      const req = https.request(
        {
          hostname,
          port: 443,
          method: "HEAD",
          timeout: 8000,
          rejectUnauthorized: true,
        },
        (res) => {
          clearTimeout(timeout);
          const socket = res.socket as any;
          if (socket && socket.getPeerCertificate) {
            const cert = socket.getPeerCertificate();
            if (cert && cert.valid_to) {
              resolve({ valid: true, expiry: cert.valid_to });
              return;
            }
          }
          resolve({ valid: true, expiry: null });
        }
      );

      req.on("error", () => {
        clearTimeout(timeout);
        resolve({ valid: false, expiry: null });
      });

      req.on("timeout", () => {
        clearTimeout(timeout);
        req.destroy();
        resolve({ valid: false, expiry: null });
      });

      req.end();
    } catch {
      clearTimeout(timeout);
      resolve({ valid: false, expiry: null });
    }
  });
}

async function checkBackend(hostname: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://${hostname}`, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function verifyDomain(config: DomainConfig) {
  const [dnsResult, httpsResult, backendOnline] = await Promise.all([
    resolveDNS(config.domain),
    checkHTTPS(config.domain),
    checkBackend(config.domain),
  ]);

  return {
    domain: config.domain,
    service: config.service,
    backend: config.backend,
    dnsStatus: dnsResult.resolved ? "resolved" : "failed",
    dnsIp: dnsResult.ip,
    httpsStatus: httpsResult.valid ? "valid" : "invalid",
    httpsExpiry: httpsResult.expiry,
    backendStatus: backendOnline ? "online" : "offline",
    lastChecked: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  return NextResponse.json({
    domains: CONFIGURED_DOMAINS,
    count: CONFIGURED_DOMAINS.length,
  });
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
    const body = await request.json().catch(() => ({}));
    const { domain, verifyAll } = body;

    if (verifyAll) {
      const results = await Promise.all(
        CONFIGURED_DOMAINS.map((config) => verifyDomain(config))
      );

      return NextResponse.json({
        results,
        checkedAt: new Date().toISOString(),
        summary: {
          total: results.length,
          dnsResolved: results.filter((r) => r.dnsStatus === "resolved").length,
          httpsValid: results.filter((r) => r.httpsStatus === "valid").length,
          backendOnline: results.filter((r) => r.backendStatus === "online").length,
        },
      });
    }

    if (domain) {
      const config = CONFIGURED_DOMAINS.find((d) => d.domain === domain);
      if (!config) {
        return NextResponse.json({ error: "Domain not found" }, { status: 404 });
      }

      const result = await verifyDomain(config);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Missing domain or verifyAll parameter" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Domain verify error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
