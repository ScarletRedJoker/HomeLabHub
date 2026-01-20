import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { websiteProjects, websitePages, websiteHistory } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

interface AIEditRequest {
  prompt: string;
  pageId?: string;
  componentId?: string;
  action: "edit" | "generate" | "seo" | "accessibility" | "suggest";
  context?: Record<string, unknown>;
}

interface AIEditResponse {
  success: boolean;
  changes?: {
    type: "html" | "css" | "content" | "structure";
    before?: string;
    after: string;
    componentId?: string;
    description: string;
  }[];
  suggestions?: string[];
  analysis?: {
    seo?: { score: number; issues: string[]; recommendations: string[] };
    accessibility?: { score: number; issues: string[]; recommendations: string[] };
  };
  error?: string;
}

async function analyzePageSEO(html: string, title: string, description: string): Promise<{
  score: number;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  if (!title || title.length < 10) {
    issues.push("Page title is missing or too short");
    recommendations.push("Add a descriptive title between 50-60 characters");
    score -= 20;
  } else if (title.length > 60) {
    issues.push("Page title is too long");
    recommendations.push("Shorten title to under 60 characters");
    score -= 10;
  }

  if (!description || description.length < 50) {
    issues.push("Meta description is missing or too short");
    recommendations.push("Add a meta description between 150-160 characters");
    score -= 20;
  } else if (description.length > 160) {
    issues.push("Meta description is too long");
    recommendations.push("Shorten description to under 160 characters");
    score -= 10;
  }

  const h1Count = (html.match(/<h1/gi) || []).length;
  if (h1Count === 0) {
    issues.push("No H1 heading found");
    recommendations.push("Add a single H1 heading at the top of the page");
    score -= 15;
  } else if (h1Count > 1) {
    issues.push("Multiple H1 headings found");
    recommendations.push("Use only one H1 heading per page");
    score -= 10;
  }

  const imgWithoutAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
  if (imgWithoutAlt > 0) {
    issues.push(`${imgWithoutAlt} images missing alt attributes`);
    recommendations.push("Add descriptive alt text to all images");
    score -= 5 * imgWithoutAlt;
  }

  return { score: Math.max(0, score), issues, recommendations };
}

async function analyzeAccessibility(html: string): Promise<{
  score: number;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  const imgWithoutAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
  if (imgWithoutAlt > 0) {
    issues.push(`${imgWithoutAlt} images missing alt text`);
    recommendations.push("Add alt attributes to all images for screen readers");
    score -= 10 * imgWithoutAlt;
  }

  const hasFormLabels = html.includes("<label");
  const hasFormInputs = html.includes("<input");
  if (hasFormInputs && !hasFormLabels) {
    issues.push("Form inputs without associated labels");
    recommendations.push("Add <label> elements for all form inputs");
    score -= 15;
  }

  const hasSkipLink = html.includes("skip") && html.includes("main");
  if (!hasSkipLink) {
    recommendations.push("Consider adding a skip-to-main-content link");
    score -= 5;
  }

  const hasAriaLandmarks = html.includes('role="') || 
    html.includes("<nav") || 
    html.includes("<main") || 
    html.includes("<header") || 
    html.includes("<footer");
  if (!hasAriaLandmarks) {
    issues.push("Missing ARIA landmarks");
    recommendations.push("Add semantic HTML5 elements (nav, main, header, footer) or ARIA roles");
    score -= 10;
  }

  return { score: Math.max(0, score), issues, recommendations };
}

async function generateAIEdit(
  prompt: string,
  currentHtml: string,
  currentCss: string,
  context: Record<string, unknown>
): Promise<{ html?: string; css?: string; description: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a web development assistant that helps edit HTML and CSS. 
Given a user's request, modify the provided HTML/CSS accordingly.
Return your response as JSON with the following structure:
{
  "html": "modified HTML if changed",
  "css": "modified CSS if changed",
  "description": "brief description of changes made"
}
Only include html or css fields if they were actually modified.
Keep the existing structure and classes unless specifically asked to change them.`,
        },
        {
          role: "user",
          content: `User request: "${prompt}"

Current HTML:
\`\`\`html
${currentHtml}
\`\`\`

Current CSS:
\`\`\`css
${currentCss}
\`\`\`

Context: ${JSON.stringify(context)}

Please modify the code according to the user's request.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      html: result.html,
      css: result.css,
      description: result.description || "Applied requested changes",
    };
  } catch (error) {
    console.error("OpenAI error:", error);
    throw new Error("Failed to generate AI edit");
  }
}

async function generateContent(
  prompt: string,
  sectionType: string,
  context: Record<string, unknown>
): Promise<{ html: string; css: string; description: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a web content generator. Generate HTML and CSS for website sections.
Return your response as JSON with:
{
  "html": "the HTML content",
  "css": "the CSS styles",
  "description": "brief description of the generated content"
}
Generate clean, semantic HTML with modern CSS. Use class names that are descriptive.`,
        },
        {
          role: "user",
          content: `Generate a ${sectionType} section with the following requirements: "${prompt}"

Context about the website: ${JSON.stringify(context)}

Please generate the HTML and CSS.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      html: result.html || "",
      css: result.css || "",
      description: result.description || "Generated new content",
    };
  } catch (error) {
    console.error("OpenAI error:", error);
    throw new Error("Failed to generate content");
  }
}

async function getSuggestions(
  html: string,
  css: string,
  context: Record<string, unknown>
): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a web design consultant. Analyze the provided HTML/CSS and suggest improvements.
Return your response as JSON with:
{
  "suggestions": ["suggestion 1", "suggestion 2", ...]
}
Focus on:
- Visual design improvements
- User experience enhancements
- Performance optimizations
- Modern web practices`,
        },
        {
          role: "user",
          content: `Analyze this website section and provide improvement suggestions:

HTML:
\`\`\`html
${html}
\`\`\`

CSS:
\`\`\`css
${css}
\`\`\`

Context: ${JSON.stringify(context)}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.suggestions || [];
  } catch (error) {
    console.error("OpenAI error:", error);
    return ["Unable to generate suggestions at this time"];
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: AIEditRequest = await request.json();
    const { prompt, pageId, componentId, action, context = {} } = body;

    if (!prompt && action !== "seo" && action !== "accessibility") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const [project] = await db.select().from(websiteProjects).where(eq(websiteProjects.id, id));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    let page = null;
    if (pageId) {
      const pages = await db.select().from(websitePages).where(eq(websitePages.id, pageId));
      page = pages[0];
    } else {
      const pages = await db.select().from(websitePages)
        .where(eq(websitePages.projectId, id))
        .limit(1);
      page = pages[0];
    }

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const components = (page.components || []) as Array<{
      id: string;
      html: string;
      css?: string;
      type: string;
    }>;
    
    let currentHtml = "";
    let currentCss = page.pageCss || "";
    let targetComponent = null;

    if (componentId) {
      targetComponent = components.find(c => c.id === componentId);
      if (targetComponent) {
        currentHtml = targetComponent.html;
        currentCss = targetComponent.css || "";
      }
    } else {
      currentHtml = components.map(c => c.html).join("\n");
    }

    const response: AIEditResponse = { success: true };

    switch (action) {
      case "edit": {
        const editResult = await generateAIEdit(prompt, currentHtml, currentCss, {
          ...context,
          projectName: project.name,
          pageName: page.name,
        });

        response.changes = [];

        if (editResult.html) {
          response.changes.push({
            type: "html",
            before: currentHtml,
            after: editResult.html,
            componentId,
            description: editResult.description,
          });

          if (componentId && targetComponent) {
            const updatedComponents = components.map(c =>
              c.id === componentId ? { ...c, html: editResult.html } : c
            );
            await db.update(websitePages)
              .set({ 
                components: updatedComponents as unknown as [],
                updatedAt: new Date(),
              })
              .where(eq(websitePages.id, page.id));
          }
        }

        if (editResult.css) {
          response.changes.push({
            type: "css",
            before: currentCss,
            after: editResult.css,
            componentId,
            description: "CSS updated",
          });

          if (componentId && targetComponent) {
            const updatedComponents = components.map(c =>
              c.id === componentId ? { ...c, css: editResult.css } : c
            );
            await db.update(websitePages)
              .set({ 
                components: updatedComponents as unknown as [],
                updatedAt: new Date(),
              })
              .where(eq(websitePages.id, page.id));
          }
        }

        await db.insert(websiteHistory).values({
          projectId: id,
          pageId: page.id,
          action: "ai_edit",
          snapshot: {
            prompt,
            changes: response.changes,
            componentId,
          },
        });

        break;
      }

      case "generate": {
        const sectionType = (context.sectionType as string) || "content section";
        const generated = await generateContent(prompt, sectionType, {
          ...context,
          projectName: project.name,
        });

        response.changes = [{
          type: "html",
          after: generated.html,
          description: generated.description,
        }];

        if (generated.css) {
          response.changes.push({
            type: "css",
            after: generated.css,
            description: "Generated styles",
          });
        }

        break;
      }

      case "seo": {
        const fullHtml = components.map(c => c.html).join("\n");
        const seoAnalysis = await analyzePageSEO(
          fullHtml,
          page.title || "",
          page.description || ""
        );

        response.analysis = { seo: seoAnalysis };
        break;
      }

      case "accessibility": {
        const fullHtml = components.map(c => c.html).join("\n");
        const a11yAnalysis = await analyzeAccessibility(fullHtml);

        response.analysis = { accessibility: a11yAnalysis };
        break;
      }

      case "suggest": {
        const fullHtml = components.map(c => c.html).join("\n");
        const fullCss = [page.pageCss, ...components.map(c => c.css)].filter(Boolean).join("\n");

        response.suggestions = await getSuggestions(fullHtml, fullCss, {
          ...context,
          projectName: project.name,
          pageName: page.name,
        });
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("AI edit error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "AI edit failed" 
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    actions: ["edit", "generate", "seo", "accessibility", "suggest"],
    examples: {
      edit: {
        prompt: "Make the hero section background blue",
        action: "edit",
        componentId: "optional-component-id",
      },
      generate: {
        prompt: "Create a testimonials section with 3 customer quotes",
        action: "generate",
        context: { sectionType: "testimonials" },
      },
      seo: {
        action: "seo",
        pageId: "page-id",
      },
      accessibility: {
        action: "accessibility",
        pageId: "page-id",
      },
      suggest: {
        prompt: "How can I improve this page?",
        action: "suggest",
      },
    },
  });
}
