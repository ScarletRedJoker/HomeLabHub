import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { domains, dnsRecords, services } from "@/lib/db/platform-schema";
import { eq, sql } from "drizzle-orm";

interface DomainWithRecords {
  id: string;
  name: string;
  provider: string | null;
  zoneId: string | null;
  status: string;
  sslStatus: string | null;
  sslExpiresAt: Date | null;
  recordCount: number;
  createdAt: Date | null;
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface CloudflareStatus {
  configured: boolean;
  connected: boolean;
  error: string | null;
  zonesAvailable: number;
}

async function getCloudflareStatus(): Promise<CloudflareStatus> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  
  if (!apiToken && !apiKey) {
    return {
      configured: false,
      connected: false,
      error: "Cloudflare credentials not configured. Add CLOUDFLARE_API_TOKEN to enable Cloudflare features.",
      zonesAvailable: 0,
    };
  }

  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/zones?per_page=1", {
      headers: {
        Authorization: `Bearer ${apiToken || apiKey}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    if (data.success) {
      return {
        configured: true,
        connected: true,
        error: null,
        zonesAvailable: data.result_info?.total_count || 0,
      };
    }
    return {
      configured: true,
      connected: false,
      error: data.errors?.[0]?.message || "Failed to connect to Cloudflare API",
      zonesAvailable: 0,
    };
  } catch (e: any) {
    return {
      configured: true,
      connected: false,
      error: e.message || "Failed to connect to Cloudflare API",
      zonesAvailable: 0,
    };
  }
}

async function getCloudflareZones() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  if (!apiToken && !apiKey) return [];

  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/zones", {
      headers: {
        Authorization: `Bearer ${apiToken || apiKey}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    if (data.success) {
      return data.result.map((zone: any) => ({
        id: zone.id,
        name: zone.name,
        status: zone.status,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

async function fetchDomainFromCloudflare(zoneId: string) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) return null;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await response.json();
    if (data.success) {
      return data.result;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConnected()) {
    return NextResponse.json(
      { error: "Database not connected" },
      { status: 503 }
    );
  }

  try {
    const allDomains = await db.select().from(domains).orderBy(domains.name);

    const domainsWithRecords: DomainWithRecords[] = await Promise.all(
      allDomains.map(async (domain) => {
        const records = await db
          .select({ count: sql<number>`count(*)` })
          .from(dnsRecords)
          .where(eq(dnsRecords.domainId, domain.id));

        return {
          id: domain.id,
          name: domain.name,
          provider: domain.provider,
          zoneId: domain.zoneId,
          status: domain.sslStatus === "valid" ? "active" : "pending",
          sslStatus: domain.sslStatus,
          sslExpiresAt: domain.sslExpiresAt,
          recordCount: Number(records[0]?.count || 0),
          createdAt: domain.createdAt,
        };
      })
    );

    const [cloudflareZones, cloudflareStatus] = await Promise.all([
      getCloudflareZones(),
      getCloudflareStatus(),
    ]);

    return NextResponse.json({
      domains: domainsWithRecords,
      cloudflareZones,
      cloudflareEnabled: cloudflareStatus.configured && cloudflareStatus.connected,
      cloudflareStatus,
    });
  } catch (error: any) {
    console.error("Domains GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConnected()) {
    return NextResponse.json(
      { error: "Database not connected" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { name, provider, zoneId, importFromCloudflare } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Domain name is required" },
        { status: 400 }
      );
    }

    const existing = await db
      .select()
      .from(domains)
      .where(eq(domains.name, name.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Domain already exists" },
        { status: 409 }
      );
    }

    let sslStatus = "pending";
    let sslExpiresAt: Date | null = null;

    if (importFromCloudflare && zoneId) {
      const zoneData = await fetchDomainFromCloudflare(zoneId);
      if (zoneData) {
        sslStatus = zoneData.ssl?.status === "active" ? "valid" : "pending";
      }
    }

    const [newDomain] = await db
      .insert(domains)
      .values({
        name: name.toLowerCase(),
        provider: provider || "cloudflare",
        zoneId: zoneId || null,
        sslStatus,
        sslExpiresAt,
      })
      .returning();

    if (importFromCloudflare && zoneId) {
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      if (apiToken) {
        const recordsResponse = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        const recordsData = await recordsResponse.json();

        if (recordsData.success && recordsData.result) {
          for (const record of recordsData.result) {
            await db.insert(dnsRecords).values({
              domainId: newDomain.id,
              recordType: record.type,
              name: record.name,
              content: record.content,
              ttl: record.ttl || 3600,
              proxied: record.proxied || false,
              providerId: record.id,
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true, domain: newDomain });
  } catch (error: any) {
    console.error("Domains POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
