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

async function resolveDNS(hostname: string, recordType: string): Promise<string[]> {
  try {
    const dnsServers = ["8.8.8.8", "1.1.1.1", "208.67.222.222"];
    const results: string[] = [];

    for (const dnsServer of dnsServers) {
      try {
        const response = await fetch(
          `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${recordType}`,
          {
            headers: { Accept: "application/dns-json" },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.Answer) {
            for (const answer of data.Answer) {
              if (!results.includes(answer.data)) {
                results.push(answer.data);
              }
            }
          }
        }
        break;
      } catch (e) {
        continue;
      }
    }

    return results;
  } catch {
    return [];
  }
}

async function checkCloudflareStatus(zoneId: string, recordId: string) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) return null;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (data.success && data.result) {
      return {
        proxied: data.result.proxied,
        ttl: data.result.ttl,
        modified_on: data.result.modified_on,
      };
    }
    return null;
  } catch {
    return null;
  }
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

    const allRecords = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.domainId, domainId));

    const verificationResults = await Promise.all(
      allRecords.slice(0, 10).map(async (record) => {
        const actualResults = await resolveDNS(record.name, record.recordType);

        let expected = record.content;
        if (record.recordType === "CNAME") {
          expected = expected.endsWith(".") ? expected : `${expected}.`;
        }

        const propagated = actualResults.some((result) => {
          const normalizedResult = result.toLowerCase().replace(/\.+$/, "");
          const normalizedExpected = expected.toLowerCase().replace(/\.+$/, "");
          return (
            normalizedResult === normalizedExpected ||
            normalizedResult.includes(normalizedExpected) ||
            normalizedExpected.includes(normalizedResult)
          );
        });

        return {
          name: record.name,
          type: record.recordType,
          expected: record.content,
          actual: actualResults,
          propagated,
          proxied: record.proxied,
        };
      })
    );

    const allPropagated = verificationResults.every((r) => r.propagated);

    return NextResponse.json({
      domain: domain.name,
      propagated: allPropagated,
      records: verificationResults,
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Verify GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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

  try {
    const { domain: domainId } = await params;

    const body = await request.json().catch(() => ({}));
    const { recordTypes } = body;

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    let allRecords = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.domainId, domainId));

    if (recordTypes && Array.isArray(recordTypes)) {
      allRecords = allRecords.filter((r) => recordTypes.includes(r.recordType));
    }

    const verificationResults = await Promise.all(
      allRecords.slice(0, 20).map(async (record) => {
        const actualResults = await resolveDNS(record.name, record.recordType);

        let expected = record.content;

        let propagated = false;

        if (record.proxied && domain.provider === "cloudflare") {
          propagated = actualResults.length > 0;
        } else {
          propagated = actualResults.some((result) => {
            const normalizedResult = result.toLowerCase().replace(/\.+$/, "");
            const normalizedExpected = expected.toLowerCase().replace(/\.+$/, "");
            return (
              normalizedResult === normalizedExpected ||
              normalizedResult.includes(normalizedExpected) ||
              normalizedExpected.includes(normalizedResult)
            );
          });
        }

        let cloudflareStatus = null;
        if (domain.zoneId && record.providerId) {
          cloudflareStatus = await checkCloudflareStatus(
            domain.zoneId,
            record.providerId
          );
        }

        return {
          id: record.id,
          name: record.name,
          type: record.recordType,
          expected: record.content,
          actual: actualResults,
          propagated,
          proxied: record.proxied,
          cloudflare: cloudflareStatus,
        };
      })
    );

    const propagatedCount = verificationResults.filter((r) => r.propagated).length;
    const totalCount = verificationResults.length;
    const allPropagated = propagatedCount === totalCount;

    return NextResponse.json({
      domain: domain.name,
      propagated: allPropagated,
      propagatedCount,
      totalCount,
      records: verificationResults,
      checkedAt: new Date().toISOString(),
      provider: domain.provider,
      zoneId: domain.zoneId,
    });
  } catch (error: any) {
    console.error("Verify POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
