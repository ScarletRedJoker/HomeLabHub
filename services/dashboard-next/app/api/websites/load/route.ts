import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface ParsedComponent {
  id: string;
  type: string;
  category: string;
  html: string;
  css?: string;
  props: Record<string, unknown>;
  position: { x: number; y: number };
  size: { width: string; height: string };
}

interface PageContent {
  title: string;
  slug: string;
  html: string;
  css?: string;
  js?: string;
  components: ParsedComponent[];
}

function extractCssFromHtml(html: string): { html: string; css: string } {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let css = "";
  let cleanHtml = html;

  let match;
  while ((match = styleRegex.exec(html)) !== null) {
    css += match[1] + "\n";
  }

  cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  return { html: cleanHtml, css };
}

function parseHtmlIntoComponents(html: string): ParsedComponent[] {
  const components: ParsedComponent[] = [];
  let componentId = 0;

  const removeScripts = (content: string) => {
    return content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  };

  const cleanHtml = removeScripts(html);

  const mainSections = cleanHtml.match(
    /<(nav|header|main|section|article|div[^>]*class="[^"]*hero|div[^>]*id="[^"]*"[^>]*)[\s\S]*?<\/\1>/gi
  ) || [];

  let yPosition = 0;

  // Parse major sections
  for (const section of mainSections) {
    const containsHero = section.match(/hero|banner|header/i);
    const containsNav = section.match(/<nav/i);
    const containsFooter = section.match(/<footer/i);

    let category = "content";
    let type = "section";

    if (containsNav) {
      category = "headers";
      type = "navbar";
    } else if (containsHero) {
      category = "headers";
      type = "hero";
    } else if (containsFooter) {
      category = "footers";
      type = "footer";
    }

    components.push({
      id: `component-${componentId++}`,
      type,
      category,
      html: section.substring(0, 500),
      props: {},
      position: { x: 0, y: yPosition },
      size: { width: "100%", height: "auto" },
    });

    yPosition += 300;
  }

  // If no sections found, treat the whole content as a single component
  if (components.length === 0) {
    components.push({
      id: "component-0",
      type: "custom",
      category: "layout",
      html: cleanHtml.substring(0, 1000),
      props: {},
      position: { x: 0, y: 0 },
      size: { width: "100%", height: "auto" },
    });
  }

  return components;
}

async function loadFromLocalPath(
  path: string
): Promise<PageContent | null> {
  try {
    const indexPath = join(path, "index.html");

    if (!existsSync(indexPath)) {
      return null;
    }

    const htmlContent = readFileSync(indexPath, "utf-8");
    const { html, css } = extractCssFromHtml(htmlContent);

    const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : "Imported Page";

    const components = parseHtmlIntoComponents(html);

    return {
      title,
      slug: "/",
      html: htmlContent,
      css,
      components,
    };
  } catch (error) {
    console.error("Error loading from local path:", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const siteId = request.nextUrl.searchParams.get("siteId");
    const page = request.nextUrl.searchParams.get("page") || "index";

    if (!siteId) {
      return NextResponse.json(
        { error: "siteId parameter is required" },
        { status: 400 }
      );
    }

    // Parse local static sites
    if (siteId.startsWith("local-")) {
      const domain = siteId.replace("local-", "").replace(/-/g, ".");
      const staticSitePath = join(process.cwd(), "..", "..", "static-site", domain, "public_html");

      const pageContent = await loadFromLocalPath(staticSitePath);

      if (!pageContent) {
        return NextResponse.json(
          { error: "Failed to load page from local site" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        site: {
          id: siteId,
          domain,
          type: "static",
        },
        pages: [pageContent],
      });
    }

    // For deployed sites, we would fetch from the actual server
    // This is a placeholder for now
    if (siteId.startsWith("caddy-") || siteId.startsWith("server-")) {
      // In a real scenario, we'd SSH into the deployment target
      // and fetch the HTML/React files
      return NextResponse.json(
        { error: "Remote site loading requires SSH connection - coming soon" },
        { status: 501 }
      );
    }

    return NextResponse.json(
      { error: "Unknown site type" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Load page error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load page" },
      { status: 500 }
    );
  }
}
