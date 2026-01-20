import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

interface ComponentInstance {
  id: string;
  type: string;
  category: string;
  html: string;
  css?: string;
  props: Record<string, unknown>;
  position: { x: number; y: number };
  size: { width: string; height: string };
}

interface SaveRequest {
  siteId: string;
  page: string;
  html: string;
  css?: string;
  js?: string;
  components?: ComponentInstance[];
}

function formatHtmlFile(html: string, css?: string, js?: string): string {
  let content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page</title>
`;

  if (css) {
    content += `  <style>
${css
  .split("\n")
  .map((line) => (line ? "    " + line : line))
  .join("\n")}
  </style>
`;
  }

  content += `</head>
<body>
${html
  .split("\n")
  .map((line) => (line ? "  " + line : line))
  .join("\n")}
`;

  if (js) {
    content += `  <script>
${js
  .split("\n")
  .map((line) => (line ? "    " + line : line))
  .join("\n")}
  </script>
`;
  }

  content += `</body>
</html>`;

  return content;
}

function reconstructHtmlFromComponents(
  components: ComponentInstance[]
): string {
  const sortedComponents = components.sort(
    (a, b) => a.position.y - b.position.y
  );

  return sortedComponents
    .map((component) => component.html)
    .join("\n\n");
}

async function saveToLocalPath(
  sitePath: string,
  page: string,
  html: string,
  css?: string,
  js?: string
): Promise<boolean> {
  try {
    const filePath = page === "/" || page === "index"
      ? join(sitePath, "index.html")
      : join(sitePath, `${page}.html`);

    // Ensure directory exists
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const formattedHtml = formatHtmlFile(html, css, js);
    writeFileSync(filePath, formattedHtml, "utf-8");

    return true;
  } catch (error) {
    console.error("Error saving to local path:", error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveRequest = await request.json();
    const { siteId, page, html, css, js, components } = body;

    if (!siteId || !html) {
      return NextResponse.json(
        { error: "siteId and html are required" },
        { status: 400 }
      );
    }

    // Reconstruct HTML from components if provided
    const finalHtml = components
      ? reconstructHtmlFromComponents(components)
      : html;

    // Save to local static sites
    if (siteId.startsWith("local-")) {
      const domain = siteId.replace("local-", "").replace(/-/g, ".");
      const staticSitePath = join(
        process.cwd(),
        "..",
        "..",
        "static-site",
        domain,
        "public_html"
      );

      await saveToLocalPath(staticSitePath, page || "/", finalHtml, css, js);

      return NextResponse.json({
        success: true,
        message: "Site updated successfully",
        site: {
          id: siteId,
          domain,
          type: "static",
        },
      });
    }

    // For deployed sites, this would require SSH connection
    if (siteId.startsWith("caddy-") || siteId.startsWith("server-")) {
      return NextResponse.json(
        { error: "Remote site editing requires SSH connection - coming soon" },
        { status: 501 }
      );
    }

    return NextResponse.json(
      { error: "Unknown site type" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Save source error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save changes" },
      { status: 500 }
    );
  }
}
