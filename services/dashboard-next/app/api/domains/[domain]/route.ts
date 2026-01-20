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

export async function GET(
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

    const records = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.domainId, domainId))
      .orderBy(dnsRecords.recordType, dnsRecords.name);

    const hasCloudflareToken = !!(process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY);
    const cloudflareEnabled = !!domain.zoneId && hasCloudflareToken;
    
    return NextResponse.json({
      domain,
      records,
      cloudflareEnabled,
      cloudflareStatus: {
        configured: hasCloudflareToken,
        zoneLinked: !!domain.zoneId,
        canSync: cloudflareEnabled,
        message: !hasCloudflareToken 
          ? "Cloudflare API credentials not configured" 
          : !domain.zoneId 
            ? "Domain not linked to a Cloudflare zone"
            : null,
      },
    });
  } catch (error: any) {
    console.error("Domain GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
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

  try {
    const { domain: domainId } = await params;
    const body = await request.json();
    const { provider, zoneId, sslStatus, sslExpiresAt } = body;

    const [existing] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(domains)
      .set({
        provider: provider ?? existing.provider,
        zoneId: zoneId ?? existing.zoneId,
        sslStatus: sslStatus ?? existing.sslStatus,
        sslExpiresAt: sslExpiresAt ? new Date(sslExpiresAt) : existing.sslExpiresAt,
      })
      .where(eq(domains.id, domainId))
      .returning();

    return NextResponse.json({ success: true, domain: updated });
  } catch (error: any) {
    console.error("Domain PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
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

  try {
    const { domain: domainId } = await params;

    const [existing] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    await db.delete(dnsRecords).where(eq(dnsRecords.domainId, domainId));
    await db.delete(domains).where(eq(domains.id, domainId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Domain DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
