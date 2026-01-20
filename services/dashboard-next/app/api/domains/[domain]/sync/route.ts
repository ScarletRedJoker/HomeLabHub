import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { domains, dnsRecords } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
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

  const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY;
  if (!apiToken) {
    return NextResponse.json(
      { 
        error: "Cloudflare not configured",
        code: "CLOUDFLARE_NOT_CONFIGURED",
        message: "Cloudflare API credentials are not configured. Add CLOUDFLARE_API_TOKEN in the Secrets Manager to enable DNS sync.",
        setupUrl: "/secrets-manager",
        requiresCloudflare: true,
      },
      { status: 400 }
    );
  }

  try {
    const { domain: domainId } = await params;

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (!domain.zoneId) {
      return NextResponse.json(
        { 
          error: "Zone not linked",
          code: "ZONE_NOT_LINKED",
          message: "This domain is not linked to a Cloudflare zone. Edit the domain to link it to a zone.",
          requiresCloudflare: true,
        },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}/dns_records?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (!data.success) {
      return NextResponse.json(
        { error: "Failed to fetch from Cloudflare", details: data.errors },
        { status: 500 }
      );
    }

    await db.delete(dnsRecords).where(eq(dnsRecords.domainId, domainId));

    const cloudflareRecords = data.result || [];
    let importedCount = 0;

    for (const record of cloudflareRecords) {
      await db.insert(dnsRecords).values({
        domainId: domain.id,
        recordType: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl || 3600,
        proxied: record.proxied || false,
        providerId: record.id,
      });
      importedCount++;
    }

    const zoneResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const zoneData = await zoneResponse.json();
    if (zoneData.success && zoneData.result) {
      const sslStatus =
        zoneData.result.ssl?.status === "active" ? "valid" : "pending";

      await db
        .update(domains)
        .set({ sslStatus })
        .where(eq(domains.id, domainId));
    }

    return NextResponse.json({
      success: true,
      importedRecords: importedCount,
      message: `Synced ${importedCount} DNS records from Cloudflare`,
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
