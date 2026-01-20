import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db, isDbConnected } from "@/lib/db";
import { domains } from "@/lib/db/platform-schema";
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

  const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY;
  if (!apiToken) {
    return NextResponse.json(
      { 
        error: "Cloudflare not configured",
        code: "CLOUDFLARE_NOT_CONFIGURED",
        message: "Cloudflare API credentials are not configured. Add CLOUDFLARE_API_TOKEN in the Secrets Manager to enable analytics.",
        setupUrl: "/secrets-manager",
        requiresCloudflare: true,
      },
      { status: 400 }
    );
  }

  try {
    const { domain: domainId } = await params;
    const timeframe = request.nextUrl.searchParams.get("timeframe") || "24h";

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

    const now = new Date();
    let since: Date;

    switch (timeframe) {
      case "1h":
        since = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case "6h":
        since = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case "24h":
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const analyticsQuery = `
      query {
        viewer {
          zones(filter: {zoneTag: "${domain.zoneId}"}) {
            httpRequests1dGroups(
              limit: 7
              filter: {date_gt: "${since.toISOString().split("T")[0]}"}
            ) {
              dimensions {
                date
              }
              sum {
                requests
                bytes
                cachedBytes
                threats
                pageViews
              }
              uniq {
                uniques
              }
            }
          }
        }
      }
    `;

    const graphqlResponse = await fetch(
      "https://api.cloudflare.com/client/v4/graphql",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: analyticsQuery }),
      }
    );

    const graphqlData = await graphqlResponse.json();

    let analytics = {
      totalRequests: 0,
      totalBandwidth: 0,
      cachedBandwidth: 0,
      threatsBlocked: 0,
      uniqueVisitors: 0,
      pageViews: 0,
      dailyData: [] as any[],
    };

    if (graphqlData.data?.viewer?.zones?.[0]?.httpRequests1dGroups) {
      const groups = graphqlData.data.viewer.zones[0].httpRequests1dGroups;

      for (const group of groups) {
        analytics.totalRequests += group.sum?.requests || 0;
        analytics.totalBandwidth += group.sum?.bytes || 0;
        analytics.cachedBandwidth += group.sum?.cachedBytes || 0;
        analytics.threatsBlocked += group.sum?.threats || 0;
        analytics.uniqueVisitors += group.uniq?.uniques || 0;
        analytics.pageViews += group.sum?.pageViews || 0;

        analytics.dailyData.push({
          date: group.dimensions?.date,
          requests: group.sum?.requests || 0,
          bandwidth: group.sum?.bytes || 0,
          threats: group.sum?.threats || 0,
        });
      }
    }

    const settingsResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}/settings`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const settingsData = await settingsResponse.json();
    let settings: Record<string, any> = {};

    if (settingsData.success && settingsData.result) {
      for (const setting of settingsData.result) {
        settings[setting.id] = setting.value;
      }
    }

    const pageRulesResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}/pagerules`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const pageRulesData = await pageRulesResponse.json();
    const pageRules = pageRulesData.success ? pageRulesData.result : [];

    const firewallResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}/firewall/rules`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const firewallData = await firewallResponse.json();
    const firewallRules = firewallData.success ? firewallData.result : [];

    return NextResponse.json({
      analytics: {
        ...analytics,
        bandwidthFormatted: formatBytes(analytics.totalBandwidth),
        cachedBandwidthFormatted: formatBytes(analytics.cachedBandwidth),
        cacheHitRate:
          analytics.totalBandwidth > 0
            ? Math.round(
                (analytics.cachedBandwidth / analytics.totalBandwidth) * 100
              )
            : 0,
      },
      settings: {
        securityLevel: settings.security_level,
        ssl: settings.ssl,
        minify: settings.minify,
        cacheLevel: settings.cache_level,
        developmentMode: settings.development_mode,
        alwaysOnline: settings.always_online,
        browserCacheTtl: settings.browser_cache_ttl,
      },
      pageRules: pageRules.map((rule: any) => ({
        id: rule.id,
        targets: rule.targets,
        actions: rule.actions,
        status: rule.status,
        priority: rule.priority,
      })),
      firewallRules: firewallRules.map((rule: any) => ({
        id: rule.id,
        description: rule.description,
        action: rule.action,
        priority: rule.priority,
        paused: rule.paused,
      })),
      timeframe,
    });
  } catch (error: any) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
