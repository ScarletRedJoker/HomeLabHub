import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { websiteProjects, websitePages } from "@/lib/db/platform-schema";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, extname, basename } from "path";
import * as cheerio from "cheerio";

interface ImportedComponent {
  id: string;
  type: string;
  category: string;
  html: string;
  css?: string;
  props: Record<string, unknown>;
  position: { x: number; y: number };
  size: { width: string; height: string };
}

interface ParsedPage {
  name: string;
  slug: string;
  title: string;
  description: string;
  components: ImportedComponent[];
  css: string;
}

function generateId(): string {
  return `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function detectComponentType(element: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): { type: string; category: string } {
  const tagName = element.prop("tagName")?.toLowerCase() || "div";
  const className = element.attr("class") || "";
  const id = element.attr("id") || "";

  if (tagName === "nav" || className.includes("navbar") || className.includes("navigation")) {
    return { type: "navbar", category: "headers" };
  }
  
  if (className.includes("hero") || (className.includes("jumbotron") && element.find("h1").length > 0)) {
    return { type: "hero", category: "headers" };
  }
  
  if (tagName === "header" || id === "header") {
    return { type: "header", category: "headers" };
  }
  
  if (tagName === "footer" || className.includes("footer") || id === "footer") {
    return { type: "footer", category: "footers" };
  }
  
  if (tagName === "form" || className.includes("form") || className.includes("contact")) {
    return { type: "contact-form", category: "forms" };
  }
  
  if (className.includes("card") && element.parent().children(".card").length > 1) {
    return { type: "card-grid", category: "content" };
  }
  
  if (className.includes("card")) {
    return { type: "card", category: "content" };
  }
  
  if (tagName === "section" || className.includes("section")) {
    return { type: "section", category: "layout" };
  }
  
  if (element.find("img").length > 0 && element.children().length === 1) {
    return { type: "image", category: "content" };
  }
  
  if (element.find("h1, h2, h3").length > 0 && element.find("p").length > 0) {
    return { type: "text-block", category: "content" };
  }
  
  if (tagName === "div" && (className.includes("container") || className.includes("row"))) {
    return { type: "container", category: "layout" };
  }

  return { type: "custom", category: "content" };
}

function parseHtmlToComponents(html: string, css: string): ImportedComponent[] {
  const $ = cheerio.load(html);
  const components: ImportedComponent[] = [];
  let yPosition = 0;

  $("body").children().each((index, elem) => {
    const $elem = $(elem);
    const outerHtml = $.html(elem);
    
    if (!outerHtml || outerHtml.trim().length < 10) return;
    
    const tagName = $elem.prop("tagName")?.toLowerCase();
    if (tagName === "script" || tagName === "link" || tagName === "style") return;

    const { type, category } = detectComponentType($elem, $);
    
    const component: ImportedComponent = {
      id: generateId(),
      type,
      category,
      html: outerHtml,
      css: "",
      props: {
        originalClass: $elem.attr("class") || "",
        originalId: $elem.attr("id") || "",
      },
      position: { x: 0, y: yPosition },
      size: { width: "100%", height: "auto" },
    };

    components.push(component);
    yPosition += 100;
  });

  return components;
}

function parseHtmlFile(filePath: string): ParsedPage | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const $ = cheerio.load(content);
    
    const title = $("title").text() || basename(filePath, ".html");
    const description = $('meta[name="description"]').attr("content") || "";
    
    let css = "";
    $("style").each((_, elem) => {
      css += $(elem).html() + "\n";
    });
    
    const bodyHtml = $("body").html() || "";
    const components = parseHtmlToComponents(`<body>${bodyHtml}</body>`, css);
    
    const fileName = basename(filePath, ".html");
    const slug = fileName === "index" ? "/" : `/${fileName}`;
    
    return {
      name: fileName.charAt(0).toUpperCase() + fileName.slice(1),
      slug,
      title,
      description,
      components,
      css,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

async function importFromLocalPath(sourcePath: string, projectName: string): Promise<{
  project: Record<string, unknown>;
  pages: ParsedPage[];
  assets: string[];
}> {
  const pages: ParsedPage[] = [];
  const assets: string[] = [];
  let globalCss = "";

  if (!existsSync(sourcePath)) {
    throw new Error(`Source path not found: ${sourcePath}`);
  }

  const cssDir = join(sourcePath, "css");
  if (existsSync(cssDir)) {
    try {
      const cssFiles = readdirSync(cssDir).filter(f => f.endsWith(".css"));
      for (const cssFile of cssFiles) {
        const cssContent = readFileSync(join(cssDir, cssFile), "utf-8");
        globalCss += `/* ${cssFile} */\n${cssContent}\n\n`;
      }
    } catch (error) {
      console.error("Error reading CSS files:", error);
    }
  }

  const htmlFiles = readdirSync(sourcePath).filter(f => f.endsWith(".html"));
  for (const htmlFile of htmlFiles) {
    const parsed = parseHtmlFile(join(sourcePath, htmlFile));
    if (parsed) {
      pages.push(parsed);
    }
  }

  const assetsDir = join(sourcePath, "assets");
  if (existsSync(assetsDir)) {
    try {
      assets.push(...readdirSync(assetsDir).map(f => `assets/${f}`));
    } catch (error) {
      console.error("Error reading assets:", error);
    }
  }

  const srcDir = join(sourcePath, "src");
  if (existsSync(srcDir)) {
    try {
      assets.push(...readdirSync(srcDir).map(f => `src/${f}`));
    } catch (error) {
      console.error("Error reading src:", error);
    }
  }

  return {
    project: {
      name: projectName,
      globalCss,
      settings: {
        imported: true,
        sourcePath,
        importedAt: new Date().toISOString(),
      },
    },
    pages,
    assets,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, domain, path: sourcePath, name, url, deploymentTarget } = body;

    if (!source) {
      return NextResponse.json({ error: "Source is required" }, { status: 400 });
    }

    let importResult;

    switch (source) {
      case "local": {
        if (!sourcePath) {
          return NextResponse.json({ error: "Path is required for local import" }, { status: 400 });
        }
        
        const fullPath = sourcePath.startsWith("/") 
          ? sourcePath 
          : join(process.cwd(), "..", "..", sourcePath);
        
        importResult = await importFromLocalPath(fullPath, name || domain || "Imported Site");
        break;
      }

      case "url": {
        if (!url) {
          return NextResponse.json({ error: "URL is required for URL import" }, { status: 400 });
        }
        
        try {
          const response = await fetch(url);
          const html = await response.text();
          const $ = cheerio.load(html);
          
          const title = $("title").text() || new URL(url).hostname;
          const description = $('meta[name="description"]').attr("content") || "";
          
          let css = "";
          $("style").each((_, elem) => {
            css += $(elem).html() + "\n";
          });
          
          const bodyHtml = $("body").html() || "";
          const components = parseHtmlToComponents(`<body>${bodyHtml}</body>`, css);
          
          importResult = {
            project: {
              name: name || title,
              globalCss: css,
              domain: new URL(url).hostname,
              settings: {
                imported: true,
                sourceUrl: url,
                importedAt: new Date().toISOString(),
              },
            },
            pages: [{
              name: "Home",
              slug: "/",
              title,
              description,
              components,
              css,
            }],
            assets: [],
          };
        } catch (error) {
          return NextResponse.json({ 
            error: `Failed to fetch URL: ${error instanceof Error ? error.message : "Unknown error"}` 
          }, { status: 400 });
        }
        break;
      }

      case "discovered": {
        if (!sourcePath && !domain) {
          return NextResponse.json({ error: "Path or domain required for discovered site import" }, { status: 400 });
        }
        
        const fullPath = sourcePath?.startsWith("/") 
          ? sourcePath 
          : join(process.cwd(), "..", "..", sourcePath || "");
        
        if (existsSync(fullPath)) {
          importResult = await importFromLocalPath(fullPath, name || domain || "Imported Site");
        } else {
          return NextResponse.json({ 
            error: "Site files not accessible. SSH import not yet implemented." 
          }, { status: 400 });
        }
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid source type" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({
        success: true,
        message: "Import preview (database not connected)",
        preview: true,
        project: importResult.project,
        pages: importResult.pages,
        assets: importResult.assets,
      });
    }

    const [newProject] = await db.insert(websiteProjects)
      .values({
        name: importResult.project.name as string,
        description: `Imported from ${source}`,
        type: "custom",
        domain: domain || null,
        globalCss: importResult.project.globalCss as string,
        settings: {
          ...(importResult.project.settings as Record<string, unknown>),
          deploymentTarget: deploymentTarget || null,
          assets: importResult.assets,
        },
        status: "draft",
      })
      .returning();

    const createdPages = [];
    for (let i = 0; i < importResult.pages.length; i++) {
      const page = importResult.pages[i];
      const [newPage] = await db.insert(websitePages)
        .values({
          projectId: newProject.id,
          name: page.name,
          slug: page.slug,
          title: page.title,
          description: page.description,
          isHomepage: page.slug === "/",
          components: page.components as unknown as [],
          pageCss: page.css,
          sortOrder: i,
        })
        .returning();
      createdPages.push(newPage);
    }

    return NextResponse.json({
      success: true,
      project: newProject,
      pages: createdPages,
      assets: importResult.assets,
      componentsImported: importResult.pages.reduce((sum, p) => sum + p.components.length, 0),
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    supportedSources: ["local", "url", "discovered"],
    requiredFields: {
      local: ["path", "name?"],
      url: ["url", "name?"],
      discovered: ["domain", "path?", "deploymentTarget?"],
    },
    example: {
      source: "local",
      path: "static-site/scarletredjoker.com/public_html",
      name: "My Portfolio",
    },
  });
}
